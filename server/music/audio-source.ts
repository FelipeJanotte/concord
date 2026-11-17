import { spawn, type ChildProcess } from 'node:child_process'
import type { Readable } from 'node:stream'
import { MusicError, PCM_CHANNELS, PCM_FRAME_SAMPLES, PCM_SAMPLE_RATE, type AudioLocator, type AudioSource, type AudioStream, type PreparedAudio, type QueuedTrack } from './ports'
import { NODE_JS_RUNTIME, SKIP_HLS } from './youtube'

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
  return [...NODE_JS_RUNTIME, '--no-playlist', '--quiet', '--no-warnings', ...SKIP_HLS, '--format', 'bestaudio/best', '-o', '-', ytDlpInput(track.audio)]
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

const spawnPiped: Spawn = (command, args) => spawn(command, args, { stdio: 'pipe', windowsHide: true })

const STDERR_TAIL_CHARS = 400

class Tool {
  private stderr = ''
  readonly exited: Promise<number | null>
  readonly missing: Promise<never>

  constructor(
    readonly name: string,
    readonly child: ChildProcess
  ) {
    child.stderr?.on('data', (chunk: Buffer) => (this.stderr = (this.stderr + chunk.toString()).slice(-STDERR_TAIL_CHARS)))
    this.exited = new Promise((resolve) => child.once('close', (code: number | null) => resolve(code)))
    this.missing = new Promise((_, reject) => child.once('error', (err: NodeJS.ErrnoException) => reject(toolError(err, name))))
    this.missing.catch(() => {})
  }

  async failure(): Promise<string | null> {
    const code = await this.exited
    if (code === null || code === 0) return null
    return `${this.name} (código ${code}): ${this.stderr.trim().split(/\r?\n/).at(-1) || 'sem mensagem'}`
  }
}

function toolError(err: NodeJS.ErrnoException, name: string): MusicError {
  return new MusicError(err.code === 'ENOENT' ? `${name} não encontrado no servidor` : `Falha ao iniciar o ${name}`)
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
  private ffmpeg: Tool | null = null
  private readonly ytDlp: Tool

  constructor(
    private readonly tools: AudioTools,
    private readonly run: Spawn,
    private readonly track: QueuedTrack
  ) {
    this.ytDlp = new Tool('yt-dlp', run(tools.ytDlp, ytDlpArgs(track)))
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
    this.ytDlp.child.kill()
    this.ffmpeg?.child.kill()
  }

  private async *frames(): AsyncGenerator<Int16Array> {
    if (this.closed) return
    const ffmpeg = new Tool('ffmpeg', this.run(this.tools.ffmpeg, ffmpegArgs(this.track)))
    this.ffmpeg = ffmpeg
    const { stdin, stdout } = ffmpeg.child
    if (!stdin || !stdout) return
    stdin.on('error', () => {})
    this.ytDlp.child.stdout?.pipe(stdin)
    let played = 0
    for await (const frame of framesOf(stdout, Promise.race([this.ytDlp.missing, ffmpeg.missing]))) {
      played++
      yield frame
    }
    if (played > 0 || this.closed) return
    const ffmpegFailure = await ffmpeg.failure()
    this.ytDlp.child.kill()
    const reasons = [await this.ytDlp.failure(), ffmpegFailure].filter((r): r is string => r !== null)
    if (!this.closed) throw new MusicError(`Sem áudio: ${reasons.join('; ') || 'nenhum som recebido'}`)
  }
}

export class YtDlpFfmpegSource implements AudioSource {
  constructor(
    private readonly tools: AudioTools,
    private readonly run: Spawn = spawnPiped
  ) {}

  prepare(track: QueuedTrack): PreparedAudio {
    return new YtDlpFfmpegAudio(this.tools, this.run, track)
  }
}
