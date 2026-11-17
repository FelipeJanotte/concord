import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { audioToolsFromEnv, ffmpegArgs, PcmFramer, YtDlpFfmpegSource, ytDlpArgs } from './audio-source'
import { PCM_FRAME_SAMPLES, type QueuedTrack } from './ports'

const track: QueuedTrack = {
  id: 'q1',
  title: 'Garota de Ipanema',
  artists: ['Tom Jobim', 'Vinicius de Moraes'],
  coverUrl: null,
  durationMs: 320_400,
  url: 'https://open.spotify.com/track/x',
  audio: { kind: 'youtube-search', query: 'Tom Jobim, Vinicius de Moraes - Garota de Ipanema' },
  requestedBy: { accountId: 'acc', name: 'Ana' }
}

const FRAME_BYTES = PCM_FRAME_SAMPLES * 2 * 2

describe('linhas de comando', () => {
  it('faixa a buscar: o yt-dlp baixa o melhor áudio do primeiro resultado do YouTube para a saída', () => {
    const args = ytDlpArgs(track)
    expect(args.at(-1)).toBe('ytsearch1:Tom Jobim, Vinicius de Moraes - Garota de Ipanema')
    expect(args.join(' ')).toContain('--format bestaudio/best -o -')
    expect(args).toContain('--no-playlist')
    expect(args.join(' ')).toContain('--extractor-args youtube:skip=hls')
    expect(args.join(' ')).toContain(`--js-runtimes node:${process.execPath}`)
    expect(args).not.toContain('--get-url')
  })

  it('faixa com link de áudio: baixa o próprio link', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    expect(ytDlpArgs({ ...track, audio: { kind: 'audio-url', url } }).at(-1)).toBe(url)
  })

  it('ffmpeg lê da entrada padrão e converte para PCM 16 bits, 48 kHz, estéreo, cortando na duração + 5 s', () => {
    expect(ffmpegArgs(track).join(' ')).toContain('-i pipe:0 -t 326 -vn -f s16le -ar 48000 -ac 2 pipe:1')
  })

  it('caminhos dos programas pelo ambiente, com padrão no PATH', () => {
    expect(audioToolsFromEnv({})).toEqual({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' })
    expect(audioToolsFromEnv({ YTDLP_PATH: 'C:\\bin\\yt-dlp.exe', FFMPEG_PATH: '/usr/bin/ffmpeg' })).toEqual({
      ytDlp: 'C:\\bin\\yt-dlp.exe',
      ffmpeg: '/usr/bin/ffmpeg'
    })
  })
})

describe('PcmFramer', () => {
  it('junta pedaços de qualquer tamanho em quadros de 10 ms sem perder bytes', () => {
    const bytes = Buffer.alloc(FRAME_BYTES * 2 + 100)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
    const framer = new PcmFramer()
    const frames = [...framer.push(bytes.subarray(0, 700)), ...framer.push(bytes.subarray(700, 2500)), ...framer.push(bytes.subarray(2500))]
    expect(frames).toHaveLength(2)
    expect(frames.every((f) => f.length === PCM_FRAME_SAMPLES * 2)).toBe(true)
    expect(Buffer.from(frames[1].buffer)).toEqual(bytes.subarray(FRAME_BYTES, FRAME_BYTES * 2))
  })
})

class FakeProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  kill(): boolean {
    this.killed = true
    this.stdout.end()
    this.emit('close', null)
    return true
  }

  fail(reason: string, code: number): void {
    this.stderr.end(`${reason}\n`)
    this.stdout.end()
    setTimeout(() => this.emit('close', code), 0)
  }

  finish(): void {
    this.stdout.end()
    setTimeout(() => this.emit('close', 0), 0)
  }
}

interface Started {
  cmd: string
  args: string[]
  proc: FakeProcess
}

function fakeSpawn(): { run: (cmd: string, args: string[]) => ChildProcess; started: Started[]; ytDlp: () => FakeProcess; ffmpeg: () => FakeProcess } {
  const started: Started[] = []
  const find = (cmd: string) => (): FakeProcess => {
    const found = started.find((s) => s.cmd === cmd)
    if (!found) throw new Error(`${cmd} não foi iniciado`)
    return found.proc
  }
  return {
    started,
    ytDlp: find('yt-dlp'),
    ffmpeg: find('ffmpeg'),
    run: (cmd, args) => {
      const proc = new FakeProcess()
      if (cmd === 'ffmpeg') proc.stdin.pipe(proc.stdout)
      started.push({ cmd, args, proc })
      return proc as unknown as ChildProcess
    }
  }
}

async function collect(stream: AsyncIterable<Int16Array>): Promise<Int16Array[]> {
  const frames: Int16Array[] = []
  for await (const f of stream) frames.push(f)
  return frames
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 5))
const TOOLS = { ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }
const failure = (reading: Promise<unknown>): Promise<string | null> =>
  reading.then(
    () => null,
    (err: Error) => err.message
  )

describe('YtDlpFfmpegSource', () => {
  it('preparar já inicia o yt-dlp baixando para a saída, sem abrir o ffmpeg', () => {
    const { run, started } = fakeSpawn()
    new YtDlpFfmpegSource(TOOLS, run).prepare(track)
    expect(started.map((s) => s.cmd)).toEqual(['yt-dlp'])
    expect(started[0].args).toEqual(ytDlpArgs(track))
  })

  it('abrir liga a saída do yt-dlp na entrada do ffmpeg e entrega os quadros que vêm por ela', async () => {
    const { run, started, ytDlp, ffmpeg } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource(TOOLS, run).prepare(track)
    const reading = collect(prepared.open())
    await settle()
    expect(started.map((s) => s.cmd)).toEqual(['yt-dlp', 'ffmpeg'])
    expect(started[1].args).toEqual(ffmpegArgs(track))
    const pcm = Buffer.alloc(FRAME_BYTES * 3)
    for (let i = 0; i < pcm.length; i++) pcm[i] = i % 253
    ytDlp().stdout.end(pcm)
    const frames = await reading
    expect(frames).toHaveLength(3)
    expect(Buffer.concat(frames.map((f) => Buffer.from(f.buffer)))).toEqual(pcm)
    expect([ytDlp().killed, ffmpeg().killed]).toEqual([true, true])
  })

  it('o que o yt-dlp baixou antes de abrir fica esperando no pipe e chega inteiro ao ffmpeg', async () => {
    const { run, ytDlp } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource(TOOLS, run).prepare(track)
    ytDlp().stdout.write(Buffer.alloc(FRAME_BYTES * 2))
    await settle()
    const reading = collect(prepared.open())
    ytDlp().stdout.end()
    expect(await reading).toHaveLength(2)
  })

  it('fechar uma preparada que nunca foi aberta encerra o yt-dlp e abrir depois não liga o ffmpeg', async () => {
    const { run, started, ytDlp } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource(TOOLS, run).prepare(track)
    prepared.close()
    expect(ytDlp().killed).toBe(true)
    expect(await collect(prepared.open())).toEqual([])
    expect(started.map((s) => s.cmd)).toEqual(['yt-dlp'])
  })

  it('close() do áudio tocando encerra o yt-dlp e o ffmpeg e termina a leitura', async () => {
    const { run, ytDlp, ffmpeg } = fakeSpawn()
    const stream = new YtDlpFfmpegSource(TOOLS, run).prepare(track).open()
    const reading = collect(stream)
    ytDlp().stdout.write(Buffer.alloc(FRAME_BYTES))
    await settle()
    stream.close()
    expect(await reading).toHaveLength(1)
    expect([ytDlp().killed, ffmpeg().killed]).toEqual([true, true])
  })

  it('ffmpeg que fecha a entrada antes da hora não derruba o processo (EPIPE)', async () => {
    const { run, ytDlp, ffmpeg } = fakeSpawn()
    const reading = collect(new YtDlpFfmpegSource(TOOLS, run).prepare(track).open())
    await settle()
    ffmpeg().stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
    ffmpeg().fail('pipe:0: End of file', 1)
    ytDlp().finish()
    expect(await failure(reading)).toContain('ffmpeg (código 1): pipe:0: End of file')
  })

  it('yt-dlp que falha sem áudio: erro com o motivo do yt-dlp', async () => {
    const { run, ytDlp, ffmpeg } = fakeSpawn()
    const reading = collect(new YtDlpFfmpegSource(TOOLS, run).prepare(track).open())
    await settle()
    ytDlp().fail('ERROR: [youtube] dQw4w9WgXcQ: Video unavailable', 1)
    await settle()
    ffmpeg().fail('pipe:0: Invalid data found when processing input', 1)
    expect(await failure(reading)).toContain('yt-dlp (código 1): ERROR: [youtube] dQw4w9WgXcQ: Video unavailable')
  })

  it('ffmpeg que falha sem áudio: erro com o motivo dele, sem culpar o yt-dlp que ainda baixava', async () => {
    const { run, ytDlp, ffmpeg } = fakeSpawn()
    const reading = collect(new YtDlpFfmpegSource(TOOLS, run).prepare(track).open())
    await settle()
    ffmpeg().fail('Error opening input files: Invalid argument', 1)
    const error = await failure(reading)
    expect(error).toContain('ffmpeg (código 1): Error opening input files: Invalid argument')
    expect(error).not.toContain('yt-dlp')
    expect(ytDlp().killed).toBe(true)
  })

  it('yt-dlp que não existe: erro claro', async () => {
    const { run, ytDlp } = fakeSpawn()
    const reading = collect(new YtDlpFfmpegSource(TOOLS, run).prepare(track).open())
    await settle()
    ytDlp().emit('error', Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' }))
    expect(await failure(reading)).toBe('yt-dlp não encontrado no servidor')
  })

  it('ffmpeg que não existe: erro claro e o yt-dlp é encerrado', async () => {
    const { run, ytDlp, ffmpeg } = fakeSpawn()
    const reading = collect(new YtDlpFfmpegSource(TOOLS, run).prepare(track).open())
    await settle()
    ffmpeg().emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }))
    expect(await failure(reading)).toBe('ffmpeg não encontrado no servidor')
    expect(ytDlp().killed).toBe(true)
  })

  it('tocou e terminou normalmente: sem erro', async () => {
    const { run, ytDlp } = fakeSpawn()
    const reading = collect(new YtDlpFfmpegSource(TOOLS, run).prepare(track).open())
    await settle()
    ytDlp().stdout.end(Buffer.alloc(FRAME_BYTES * 2))
    expect(await reading).toHaveLength(2)
  })
})
