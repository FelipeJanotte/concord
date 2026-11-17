import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { audioToolsFromEnv, DIRECT_AUDIO_MAX_AGE_MS, ffmpegArgs, PcmFramer, YtDlpFfmpegSource, ytDlpUrlArgs } from './audio-source'
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
  it('faixa a buscar: só o endereço direto do melhor áudio do primeiro resultado do YouTube', () => {
    const args = ytDlpUrlArgs(track)
    expect(args.at(-1)).toBe('ytsearch1:Tom Jobim, Vinicius de Moraes - Garota de Ipanema')
    expect(args.join(' ')).toContain('--format bestaudio/best --get-url')
    expect(args).toContain('--no-playlist')
    expect(args.join(' ')).toContain('--extractor-args youtube:skip=hls')
  })

  it('faixa com link de áudio: endereço direto do próprio link', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    expect(ytDlpUrlArgs({ ...track, audio: { kind: 'audio-url', url } }).at(-1)).toBe(url)
  })

  it('ffmpeg lê o endereço direto reconectando e converte para PCM 16 bits, 48 kHz, estéreo, cortando na duração + 5 s', () => {
    const args = ffmpegArgs(track, 'https://audio.example/x')
    expect(args.join(' ')).toContain('-reconnect 1 -reconnect_streamed 1')
    expect(args.join(' ')).toContain('-i https://audio.example/x -t 326 -vn -f s16le -ar 48000 -ac 2 pipe:1')
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

  exit(stdout: string, code: number): void {
    this.stdout.end(stdout)
    setTimeout(() => this.emit('close', code), 0)
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

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 5))
const AUDIO_URL = 'https://rr1.googlevideo.com/videoplayback?id=1'

describe('YtDlpFfmpegSource', () => {
  it('preparar já pede ao yt-dlp o endereço direto do áudio, sem abrir o ffmpeg', () => {
    const { run, started } = fakeSpawn()
    new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track)
    expect(started.map((s) => s.cmd)).toEqual(['yt-dlp'])
  })

  it('abrir espera o endereço, liga o ffmpeg nele e entrega os quadros', async () => {
    const calls: { cmd: string; args: string[] }[] = []
    const { run: spawnFake, started } = fakeSpawn()
    const run = (cmd: string, args: string[]): ChildProcess => {
      calls.push({ cmd, args })
      return spawnFake(cmd, args)
    }
    const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track)
    const reading = collect(prepared.open())
    started[0].proc.exit(`${AUDIO_URL}
`, 0)
    await settle()
    expect(calls[1].cmd).toBe('ffmpeg')
    expect(calls[1].args).toContain(AUDIO_URL)
    started[1].proc.stdout.end(Buffer.alloc(FRAME_BYTES * 3))
    expect(await reading).toHaveLength(3)
    expect(started[1].proc.killed).toBe(true)
  })

  it('fechar antes do endereço chegar encerra o yt-dlp e nunca abre o ffmpeg', async () => {
    const { run, started } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track)
    const reading = collect(prepared.open())
    prepared.close()
    expect(await reading).toEqual([])
    await settle()
    expect(started.map((s) => s.cmd)).toEqual(['yt-dlp'])
    expect(started[0].proc.killed).toBe(true)
  })

  it('fechada depois de o endereço chegar: abrir não liga o ffmpeg', async () => {
    const { run, started } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track)
    started[0].proc.exit(AUDIO_URL, 0)
    await settle()
    prepared.close()
    expect(await collect(prepared.open())).toEqual([])
    expect(started.map((s) => s.cmd)).toEqual(['yt-dlp'])
  })

  it('fechar uma preparada que nunca foi aberta encerra o yt-dlp', () => {
    const { run, started } = fakeSpawn()
    new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track).close()
    expect(started[0].proc.killed).toBe(true)
  })

  it('close() do áudio tocando encerra o ffmpeg e termina a leitura', async () => {
    const { run, started } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track)
    started[0].proc.exit(AUDIO_URL, 0)
    await settle()
    const stream = prepared.open()
    const reading = collect(stream)
    await settle()
    stream.close()
    expect(await reading).toEqual([])
    expect(started.map((s) => s.proc.killed)).toEqual([true, true])
  })

  describe('endereço direto que veio com a faixa', () => {
    const NOW = 10 * 60_000
    const withDirect = (fetchedAt: number): QueuedTrack => ({
      ...track,
      audio: { kind: 'audio-url', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', direct: { url: AUDIO_URL, fetchedAt } }
    })

    it('recente: liga o ffmpeg nele sem chamar o yt-dlp', async () => {
      const calls: { cmd: string; args: string[] }[] = []
      const { run: spawnFake, started } = fakeSpawn()
      const run = (cmd: string, args: string[]): ChildProcess => {
        calls.push({ cmd, args })
        return spawnFake(cmd, args)
      }
      const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run, () => NOW).prepare(withDirect(NOW - DIRECT_AUDIO_MAX_AGE_MS + 1))
      expect(calls).toEqual([])
      const reading = collect(prepared.open())
      await settle()
      expect(calls.map((c) => c.cmd)).toEqual(['ffmpeg'])
      expect(calls[0].args).toContain(AUDIO_URL)
      started[0].proc.stdout.end(Buffer.alloc(FRAME_BYTES))
      expect(await reading).toHaveLength(1)
    })

    it('velho: descartado, o yt-dlp acha um endereço novo', () => {
      const { run, started } = fakeSpawn()
      new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run, () => NOW).prepare(withDirect(NOW - DIRECT_AUDIO_MAX_AGE_MS))
      expect(started.map((s) => s.cmd)).toEqual(['yt-dlp'])
    })

    it('fechar antes de abrir não liga o ffmpeg', async () => {
      const { run, started } = fakeSpawn()
      const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run, () => NOW).prepare(withDirect(NOW))
      prepared.close()
      expect(await collect(prepared.open())).toEqual([])
      expect(started).toEqual([])
    })
  })

  it('yt-dlp sem resultado: erro claro', async () => {
    const { run, started } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track)
    const reading = collect(prepared.open())
    started[0].proc.exit('', 1)
    await expect(reading).rejects.toThrow('Áudio não encontrado no YouTube')
  })

  it('programa que não existe: erro claro', async () => {
    const { run, started } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track)
    const reading = collect(prepared.open())
    started[0].proc.emit('error', Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' }))
    await expect(reading).rejects.toThrow('yt-dlp não encontrado no servidor')
  })

  it('ffmpeg que não existe: erro claro', async () => {
    const { run, started } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track)
    const reading = collect(prepared.open())
    started[0].proc.exit(AUDIO_URL, 0)
    await settle()
    started[1].proc.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }))
    await expect(reading).rejects.toThrow('ffmpeg não encontrado no servidor')
  })

  it('ffmpeg que termina sem áudio: erro com o motivo dele', async () => {
    const { run, started } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track)
    const reading = collect(prepared.open())
    started[0].proc.exit(AUDIO_URL, 0)
    await settle()
    started[1].proc.stderr.end('Server returned 403 Forbidden (access denied)\n')
    started[1].proc.exit('', 1)
    await expect(reading).rejects.toThrow('ffmpeg terminou sem áudio (código 1): Server returned 403 Forbidden (access denied)')
  })

  it('ffmpeg que tocou e terminou normalmente: sem erro', async () => {
    const { run, started } = fakeSpawn()
    const prepared = new YtDlpFfmpegSource({ ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }, run).prepare(track)
    const reading = collect(prepared.open())
    started[0].proc.exit(AUDIO_URL, 0)
    await settle()
    started[1].proc.stderr.end()
    started[1].proc.exit(Buffer.alloc(FRAME_BYTES * 2).toString('latin1'), 0)
    expect(await reading).toHaveLength(2)
  })
})
