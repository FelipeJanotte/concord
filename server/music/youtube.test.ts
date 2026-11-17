import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { PCM_FRAME_SAMPLES, type TrackMetadata } from './ports'
import { audioToolsFromEnv, ffmpegArgs, PcmFramer, youtubeSearch, YtDlpFfmpegSource, ytDlpArgs } from './youtube'

const track: TrackMetadata = {
  title: 'Garota de Ipanema',
  artists: ['Tom Jobim', 'Vinicius de Moraes'],
  coverUrl: null,
  durationMs: 320_400,
  url: 'https://open.spotify.com/track/x'
}

const FRAME_BYTES = PCM_FRAME_SAMPLES * 2 * 2

describe('linhas de comando', () => {
  it('procura "<artistas> - <título>" no YouTube e manda o áudio para a saída padrão', () => {
    expect(youtubeSearch(track)).toBe('ytsearch1:Tom Jobim, Vinicius de Moraes - Garota de Ipanema')
    const args = ytDlpArgs(track)
    expect(args.at(-1)).toBe(youtubeSearch(track))
    expect(args).toEqual(expect.arrayContaining(['--no-playlist', '--output', '-']))
  })

  it('ffmpeg converte para PCM 16 bits, 48 kHz, estéreo, cortando na duração da faixa + 5 s', () => {
    const args = ffmpegArgs(track)
    expect(args.join(' ')).toContain('-i pipe:0 -t 326 -f s16le -ar 48000 -ac 2 pipe:1')
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
  killed = false
  kill(): boolean {
    this.killed = true
    this.stdout.end()
    return true
  }
}

function fakeSpawn(): { run: (cmd: string, args: string[]) => ChildProcess; started: { cmd: string; proc: FakeProcess }[] } {
  const started: { cmd: string; proc: FakeProcess }[] = []
  return {
    started,
    run: (cmd) => {
      const proc = new FakeProcess()
      started.push({ cmd, proc })
      return proc as unknown as ChildProcess
    }
  }
}

async function collect(stream: AsyncIterable<Int16Array>): Promise<Int16Array[]> {
  const frames: Int16Array[] = []
  for await (const f of stream) frames.push(f)
  return frames
}

describe('YtDlpFfmpegSource', () => {
  it('liga a saída do yt-dlp na entrada do ffmpeg e entrega os quadros do ffmpeg', async () => {
    const { run, started } = fakeSpawn()
    const stream = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).open(track)
    const [yt, ff] = started
    const piped: Buffer[] = []
    ff.proc.stdin.on('data', (c: Buffer) => piped.push(c))
    yt.proc.stdout.write(Buffer.from('webm'))
    ff.proc.stdout.end(Buffer.alloc(FRAME_BYTES * 3))
    const frames = await collect(stream)
    expect(frames).toHaveLength(3)
    expect(Buffer.concat(piped).toString()).toBe('webm')
    expect(yt.proc.killed && ff.proc.killed).toBe(true)
  })

  it('close() encerra os dois programas e termina a leitura', async () => {
    const { run, started } = fakeSpawn()
    const stream = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).open(track)
    const reading = collect(stream)
    stream.close()
    expect(await reading).toEqual([])
    expect(started.map((s) => s.proc.killed)).toEqual([true, true])
  })

  it('programa que não existe: erro claro', async () => {
    const { run, started } = fakeSpawn()
    const stream = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).open(track)
    const reading = collect(stream)
    started[0].proc.emit('error', Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' }))
    await expect(reading).rejects.toThrow('yt-dlp não encontrado no servidor')
  })
})
