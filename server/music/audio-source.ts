import { spawn, type ChildProcess } from 'node:child_process'
import type { Readable } from 'node:stream'
import { MusicError, PCM_CHANNELS, PCM_FRAME_SAMPLES, PCM_SAMPLE_RATE, type AudioLocator, type AudioSource, type AudioStream, type QueuedTrack } from './ports'

const FRAME_BYTES = PCM_FRAME_SAMPLES * PCM_CHANNELS * 2
const DURATION_MARGIN_S = 5

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

export function ytDlpArgs(track: QueuedTrack): string[] {
  return ['--no-playlist', '--quiet', '--no-warnings', '--format', 'bestaudio/best', '--output', '-', ytDlpInput(track.audio)]
}

export function ffmpegArgs(track: QueuedTrack): string[] {
  const maxSeconds = Math.ceil(track.durationMs / 1000) + DURATION_MARGIN_S
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-t',
    String(maxSeconds),
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

const spawnPiped: Spawn = (command, args) => spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })

function missingTool(child: ChildProcess, name: string): Promise<never> {
  return new Promise((_, reject) => {
    child.once('error', (err: NodeJS.ErrnoException) => {
      reject(new MusicError(err.code === 'ENOENT' ? `${name} não encontrado no servidor` : `Falha ao iniciar o ${name}`))
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

export class YtDlpFfmpegSource implements AudioSource {
  constructor(
    private readonly tools: AudioTools,
    private readonly run: Spawn = spawnPiped
  ) {}

  open(track: QueuedTrack): AudioStream {
    const ytDlp = this.run(this.tools.ytDlp, ytDlpArgs(track))
    const ffmpeg = this.run(this.tools.ffmpeg, ffmpegArgs(track))
    const failures = Promise.race([missingTool(ytDlp, 'yt-dlp'), missingTool(ffmpeg, 'ffmpeg')])
    failures.catch(() => {})
    ytDlp.stdout?.on('error', () => {})
    ffmpeg.stdin?.on('error', () => {})
    if (ytDlp.stdout && ffmpeg.stdin) ytDlp.stdout.pipe(ffmpeg.stdin)
    const close = (): void => {
      ytDlp.kill()
      ffmpeg.kill()
    }
    const stdout = ffmpeg.stdout
    return {
      close,
      async *[Symbol.asyncIterator]() {
        try {
          if (stdout) yield* framesOf(stdout, failures)
        } finally {
          close()
        }
      }
    }
  }
}
