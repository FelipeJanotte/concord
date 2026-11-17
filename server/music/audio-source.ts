import { spawn, type ChildProcess } from 'node:child_process'
import type { Readable } from 'node:stream'
import { MusicError, PCM_CHANNELS, PCM_FRAME_SAMPLES, PCM_SAMPLE_RATE, type AudioLocator, type AudioSource, type AudioStream, type PreparedAudio, type QueuedTrack } from './ports'
import { SKIP_HLS } from './youtube'

const FRAME_BYTES = PCM_FRAME_SAMPLES * PCM_CHANNELS * 2
const DURATION_MARGIN_S = 5
export const DIRECT_AUDIO_MAX_AGE_MS = 5 * 60_000

export interface AudioTools {
  ytDlp: string
  ffmpeg: string
}

export function audioToolsFromEnv(env: NodeJS.ProcessEnv): AudioTools {
  return { ytDlp: env.YTDLP_PATH?.trim() || 'yt-dlp', ffmpeg: env.FFMPEG_PATH?.trim() || 'ffmpeg' }
}

function ytDlpInput(audio: AudioLocator): string {
  return audio.kind === 'audio-url' ? audio.url : `ytsearch1:${audio.query}`
}

export function ytDlpUrlArgs(track: QueuedTrack): string[] {
  return ['--no-playlist', '--quiet', '--no-warnings', ...SKIP_HLS, '--format', 'bestaudio/best', '--get-url', ytDlpInput(track.audio)]
}

export function ffmpegArgs(track: QueuedTrack, url: string): string[] {
  const maxSeconds = Math.ceil(track.durationMs / 1000) + DURATION_MARGIN_S
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '5',
    '-i',
    url,
    '-t',
    String(maxSeconds),
    '-vn',
    '-f',
    's16le',
    '-ar',
    String(PCM_SAMPLE_RATE),
    '-ac',
    String(PCM_CHANNELS),
    'pipe:1'
  ]
}

export class PcmFramer {
  private pending = Buffer.alloc(0)

  push(chunk: Buffer): Int16Array[] {
    const data = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk
    const frames: Int16Array[] = []
    let offset = 0
    for (; offset + FRAME_BYTES <= data.length; offset += FRAME_BYTES) {
      const frame = new Int16Array(FRAME_BYTES / 2)
      Buffer.from(frame.buffer).set(data.subarray(offset, offset + FRAME_BYTES))
      frames.push(frame)
    }
    this.pending = Buffer.from(data.subarray(offset))
    return frames
  }
}

type Spawn = (command: string, args: string[]) => ChildProcess

const spawnPiped: Spawn = (command, args) => spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })

function toolError(err: NodeJS.ErrnoException, name: string): MusicError {
  return new MusicError(err.code === 'ENOENT' ? `${name} não encontrado no servidor` : `Falha ao iniciar o ${name}`)
}

function missingTool(child: ChildProcess, name: string): Promise<never> {
  return new Promise((_, reject) => {
    child.once('error', (err: NodeJS.ErrnoException) => reject(toolError(err, name)))
  })
}

function directUrl(ytDlp: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    ytDlp.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()))
    ytDlp.once('error', (err: NodeJS.ErrnoException) => reject(toolError(err, 'yt-dlp')))
    ytDlp.once('close', (code: number | null) => {
      const url = output.split(/\r?\n/).find((line) => line.startsWith('http'))
      if (code === 0 && url) resolve(url)
      else reject(new MusicError('Áudio não encontrado no YouTube'))
    })
  })
}

async function* framesOf(stdout: Readable, failures: Promise<never>): AsyncGenerator<Int16Array> {
  const framer = new PcmFramer()
  const chunks = stdout[Symbol.asyncIterator]()
  while (true) {
    const next = await Promise.race([chunks.next(), failures])
    if (next.done) return
    yield* framer.push(next.value as Buffer)
  }
}

class YtDlpFfmpegAudio implements PreparedAudio {
  private closed = false
  private ffmpeg: ChildProcess | null = null
  private readonly ytDlp: ChildProcess | null = null
  private readonly url: Promise<string>

  constructor(
    private readonly tools: AudioTools,
    private readonly run: Spawn,
    private readonly track: QueuedTrack,
    reusable: string | null
  ) {
    if (reusable) {
      this.url = Promise.resolve(reusable)
      return
    }
    const ytDlp = run(tools.ytDlp, ytDlpUrlArgs(track))
    this.ytDlp = ytDlp
    this.url = directUrl(ytDlp)
    this.url.catch(() => {})
  }

  open(): AudioStream {
    const frames = (): AsyncGenerator<Int16Array> => this.frames()
    const close = (): void => this.close()
    return {
      close,
      async *[Symbol.asyncIterator]() {
        try {
          yield* frames()
        } finally {
          close()
        }
      }
    }
  }

  close(): void {
    this.closed = true
    this.ytDlp?.kill()
    this.ffmpeg?.kill()
  }

  private async *frames(): AsyncGenerator<Int16Array> {
    const url = await this.url.catch((err: unknown) => {
      if (this.closed) return null
      throw err
    })
    if (!url || this.closed) return
    const ffmpeg = this.run(this.tools.ffmpeg, ffmpegArgs(this.track, url))
    this.ffmpeg = ffmpeg
    const failures = missingTool(ffmpeg, 'ffmpeg')
    failures.catch(() => {})
    if (ffmpeg.stdout) yield* framesOf(ffmpeg.stdout, failures)
  }
}

export class YtDlpFfmpegSource implements AudioSource {
  constructor(
    private readonly tools: AudioTools,
    private readonly run: Spawn = spawnPiped,
    private readonly now: () => number = Date.now
  ) {}

  prepare(track: QueuedTrack): PreparedAudio {
    return new YtDlpFfmpegAudio(this.tools, this.run, track, this.reusableUrl(track.audio))
  }

  private reusableUrl(audio: AudioLocator): string | null {
    if (audio.kind !== 'audio-url' || !audio.direct) return null
    return this.now() - audio.direct.fetchedAt < DIRECT_AUDIO_MAX_AGE_MS ? audio.direct.url : null
  }
}
