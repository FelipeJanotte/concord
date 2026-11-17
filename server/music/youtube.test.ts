import { describe, expect, it } from 'vitest'
import { MusicError, PLAYLIST_READ_MAX, type TrackMetadata } from './ports'
import {
  parseYtDlpEntries,
  parseYtDlpVideo,
  YOUTUBE_UNAVAILABLE,
  YouTubeResolver,
  ytDlpRunner,
  type ExecFileLike,
  type YtDlpJson,
  type YouTubeQuery
} from './youtube'

const VIDEO = 'RY1t3IqpWVI'
const FAST = ['--ignore-no-formats-error', '--extractor-args', 'youtube:skip=hls']

const videoJson = {
  id: VIDEO,
  title: 'Garota de Ipanema - Tom Jobim',
  duration: 244.4,
  channel: 'Kim Legendes',
  uploader: 'Kim Legendes',
  thumbnail: 'https://i.ytimg.com/vi/RY1t3IqpWVI/maxresdefault.jpg',
  thumbnails: [{ url: 'https://i.ytimg.com/vi/RY1t3IqpWVI/default.jpg' }],
  webpage_url: `https://www.youtube.com/watch?v=${VIDEO}`,
  is_live: false,
  live_status: 'not_live'
}

const flatEntry = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  _type: 'url',
  ie_key: 'Youtube',
  id,
  url: `https://www.youtube.com/watch?v=${id}`,
  title: `Vídeo ${id}`,
  duration: 200,
  channel: 'Canal',
  uploader: 'Canal',
  thumbnails: [
    { url: `https://i.ytimg.com/vi/${id}/pequena.jpg`, width: 360 },
    { url: `https://i.ytimg.com/vi/${id}/grande.jpg`, width: 720 }
  ],
  live_status: null,
  ...extra
})

describe('parseYtDlpVideo', () => {
  it('título, canal, capa, duração e o próprio vídeo como áudio', () => {
    expect(parseYtDlpVideo(videoJson)).toEqual({
      title: 'Garota de Ipanema - Tom Jobim',
      artists: ['Kim Legendes'],
      coverUrl: 'https://i.ytimg.com/vi/RY1t3IqpWVI/maxresdefault.jpg',
      durationMs: 244_400,
      url: `https://www.youtube.com/watch?v=${VIDEO}`,
      live: false,
      audio: { kind: 'audio-url', url: `https://www.youtube.com/watch?v=${VIDEO}` }
    })
  })

  it('prefere o artista ao canal e tira o " - Topic" do YouTube Music', () => {
    expect(parseYtDlpVideo({ ...videoJson, artist: 'Tom Jobim' }).artists).toEqual(['Tom Jobim'])
    expect(parseYtDlpVideo({ ...videoJson, channel: 'Tom Jobim - Topic' }).artists).toEqual(['Tom Jobim'])
  })

  it('ao vivo ou agendado: live', () => {
    expect(parseYtDlpVideo({ ...videoJson, is_live: true, duration: null }).live).toBe(true)
    expect(parseYtDlpVideo({ ...videoJson, live_status: 'is_upcoming' }).live).toBe(true)
  })

  it('sem duração nem capa: 0 e null', () => {
    const track = parseYtDlpVideo({ id: VIDEO, title: 'x' })
    expect(track.durationMs).toBe(0)
    expect(track.coverUrl).toBeNull()
    expect(track.artists).toEqual([])
    expect(track.url).toBe(`https://www.youtube.com/watch?v=${VIDEO}`)
  })

  it('JSON sem id: erro', () => {
    expect(() => parseYtDlpVideo({ title: 'x' })).toThrow(MusicError)
    expect(() => parseYtDlpVideo(null)).toThrow(MusicError)
  })
})

describe('parseYtDlpEntries', () => {
  it('uma faixa por vídeo, com a maior miniatura e o link do vídeo', () => {
    const tracks = parseYtDlpEntries({ _type: 'playlist', entries: [flatEntry('aaaaaaaaaaa'), flatEntry('bbbbbbbbbbb', { live_status: 'is_live' })] })
    expect(tracks).toEqual([
      {
        title: 'Vídeo aaaaaaaaaaa',
        artists: ['Canal'],
        coverUrl: 'https://i.ytimg.com/vi/aaaaaaaaaaa/grande.jpg',
        durationMs: 200_000,
        url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        live: false,
        audio: { kind: 'audio-url', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' }
      },
      expect.objectContaining({ title: 'Vídeo bbbbbbbbbbb', live: true })
    ])
  })

  it('vídeo privado ou apagado fica sem duração; entrada sem id é ignorada', () => {
    const tracks = parseYtDlpEntries({
      entries: [flatEntry('ccccccccccc', { title: '[Private video]', duration: null, channel: null, uploader: null }), { title: 'sem id' }, null]
    })
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({ title: '[Private video]', durationMs: 0, artists: [] })
  })

  it('sem entries: lista vazia', () => {
    expect(parseYtDlpEntries({ _type: 'playlist' })).toEqual([])
  })
})

function fakeYtDlp(reply: (args: string[]) => unknown): { run: YtDlpJson; calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    run: async (args) => {
      calls.push(args)
      return reply(args)
    }
  }
}

describe('YouTubeResolver', () => {
  it('vídeo: lê o JSON do link canônico, sem playlist', async () => {
    const { run, calls } = fakeYtDlp(() => videoJson)
    const tracks = await new YouTubeResolver(run).resolve({ kind: 'youtube-video', id: VIDEO })
    expect(tracks).toEqual([parseYtDlpVideo(videoJson)])
    expect(calls).toEqual([['-J', '--no-playlist', '--no-warnings', ...FAST, `https://www.youtube.com/watch?v=${VIDEO}`]])
  })

  it('playlist: lista plana, limitada a PLAYLIST_READ_MAX', async () => {
    const { run, calls } = fakeYtDlp(() => ({ entries: [flatEntry('aaaaaaaaaaa'), flatEntry('bbbbbbbbbbb')] }))
    const tracks = await new YouTubeResolver(run).resolve({ kind: 'youtube-playlist', id: 'PLxyz' })
    expect(tracks.map((t) => t.title)).toEqual(['Vídeo aaaaaaaaaaa', 'Vídeo bbbbbbbbbbb'])
    expect(calls).toEqual([
      ['-J', '--flat-playlist', '--no-warnings', '--playlist-end', String(PLAYLIST_READ_MAX), 'https://www.youtube.com/playlist?list=PLxyz']
    ])
  })

  it('busca: primeiro resultado do ytsearch1 em lista plana, com título, canal, capa e duração', async () => {
    const { run, calls } = fakeYtDlp(() => ({ entries: [flatEntry('aaaaaaaaaaa')] }))
    const tracks = await new YouTubeResolver(run).resolve({ kind: 'search', text: 'garota de ipanema' })
    expect(tracks).toEqual(parseYtDlpEntries({ entries: [flatEntry('aaaaaaaaaaa')] }))
    expect(tracks[0]).toMatchObject({ title: 'Vídeo aaaaaaaaaaa', artists: ['Canal'], durationMs: 200_000 })
    expect(calls).toEqual([['-J', '--flat-playlist', '--no-warnings', 'ytsearch1:garota de ipanema']])
  })

  it('o áudio de toda faixa é só o link do vídeo, mesmo com os formatos no JSON', async () => {
    const formats = [{ format_id: '251', acodec: 'opus', vcodec: 'none', url: 'https://rr1.googlevideo.com/videoplayback?itag=251' }]
    const resolveWith = (json: unknown, query: YouTubeQuery): Promise<TrackMetadata[]> => new YouTubeResolver(fakeYtDlp(() => json).run).resolve(query)
    const [video] = await resolveWith({ ...videoJson, formats }, { kind: 'youtube-video', id: VIDEO })
    const [found] = await resolveWith({ entries: [flatEntry('aaaaaaaaaaa', { formats })] }, { kind: 'search', text: 'x' })
    const [listed] = await resolveWith({ entries: [flatEntry('bbbbbbbbbbb', { formats })] }, { kind: 'youtube-playlist', id: 'PLxyz' })
    expect([video.audio, found.audio, listed.audio]).toEqual([
      { kind: 'audio-url', url: `https://www.youtube.com/watch?v=${VIDEO}` },
      { kind: 'audio-url', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
      { kind: 'audio-url', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' }
    ])
  })

  it('busca sem resultado: "Nada encontrado no YouTube"', async () => {
    const { run } = fakeYtDlp(() => ({ entries: [] }))
    await expect(new YouTubeResolver(run).resolve({ kind: 'search', text: 'xyzzy' })).rejects.toThrow('Nada encontrado no YouTube para "xyzzy"')
  })

  it('playlist vazia ou privada: erro claro', async () => {
    const { run } = fakeYtDlp(() => ({ entries: [] }))
    await expect(new YouTubeResolver(run).resolve({ kind: 'youtube-playlist', id: 'PLxyz' })).rejects.toThrow(
      'Playlist do YouTube vazia ou privada'
    )
  })
})

describe('ytDlpRunner', () => {
  type Callback = (err: (Error & { code?: unknown }) | null, stdout: string, stderr: string) => void
  const execWith = (outcome: (cb: Callback) => void): { exec: ExecFileLike; seen: { file: string; args: string[] }[] } => {
    const seen: { file: string; args: string[] }[] = []
    const exec: ExecFileLike = (file, args, _options, cb) => {
      seen.push({ file, args })
      outcome(cb)
    }
    return { exec, seen }
  }

  it('roda o yt-dlp configurado, com o Node do servidor resolvendo os desafios de JavaScript, e devolve o JSON da saída', async () => {
    const { exec, seen } = execWith((cb) => cb(null, JSON.stringify({ id: VIDEO }), ''))
    expect(await ytDlpRunner('C:\bin\yt-dlp.exe', exec)(['-J', 'x'])).toEqual({ id: VIDEO })
    expect(seen).toEqual([{ file: 'C:\bin\yt-dlp.exe', args: ['--js-runtimes', `node:${process.execPath}`, '-J', 'x'] }])
  })

  it('programa ausente: "yt-dlp não encontrado no servidor"', async () => {
    const { exec } = execWith((cb) => cb(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }), '', ''))
    await expect(ytDlpRunner('yt-dlp', exec)(['-J'])).rejects.toThrow(new MusicError('yt-dlp não encontrado no servidor'))
  })

  it('vídeo indisponível ou saída inválida: erro de leitura do YouTube', async () => {
    const failed = execWith((cb) => cb(Object.assign(new Error('exit 1'), { code: 1 }), '', 'ERROR: Video unavailable'))
    await expect(ytDlpRunner('yt-dlp', failed.exec)(['-J'])).rejects.toThrow(new MusicError(YOUTUBE_UNAVAILABLE))
    const garbage = execWith((cb) => cb(null, 'não é json', ''))
    await expect(ytDlpRunner('yt-dlp', garbage.exec)(['-J'])).rejects.toThrow(new MusicError(YOUTUBE_UNAVAILABLE))
  })
})
