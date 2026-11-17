import { describe, expect, it } from 'vitest'
import { MusicError, PLAYLIST_READ_MAX } from './ports'
import { parseSpotifyEmbed, SpotifyResolver, spotifyFromEnv } from './spotify'

const ID = '4uLU6hMCjMI75M1A2tKUQC'
const ALBUM = '4aawyAB9vmqN3uQ7FjRGTy'
const PLAYLIST = '16QguuMuZbadn8Ll3exMpS'

interface Call {
  url: string
  init: RequestInit
}

function fakeSpotify(routes: Record<string, (url: URL) => Response>): { http: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const http = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const parsed = new URL(url)
    const route = routes[parsed.pathname]
    return route ? route(parsed) : new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
  return { http, calls }
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })
const tokenRoute = (): Response => json({ access_token: 'tok-1', expires_in: 3600 })
const trackBody = {
  name: 'Garota de Ipanema',
  duration_ms: 320_000,
  artists: [{ name: 'Tom Jobim' }, { name: 'Vinicius de Moraes' }],
  album: { images: [{ url: 'https://i.scdn.co/capa-grande.jpg' }, { url: 'https://i.scdn.co/capa-pequena.jpg' }] },
  external_urls: { spotify: `https://open.spotify.com/track/${ID}` }
}
const endpoints = { accounts: 'https://contas.test', api: 'https://api.test', embed: 'https://embed.test' }
const creds = { clientId: 'id', clientSecret: 'segredo' }
const track = { kind: 'spotify', type: 'track', id: ID } as const

const embedHtml = (entity: unknown): string =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script></body></html>`

const embedEntity = {
  type: 'playlist',
  name: 'Bossa para o grupo',
  coverArt: { sources: [{ url: 'https://image-cdn.spotifycdn.com/capa-playlist' }] },
  trackList: [
    { uri: 'spotify:track:5MINUtX7hvYaaWwNRrp1hl', title: 'Dancing In the Moonlight', subtitle: 'Bossa Nova Covers, Mats & My', duration: 212_689, entityType: 'track' },
    { uri: 'spotify:episode:0000000000000000000000', title: 'Um podcast', subtitle: 'Alguém', duration: 3_000_000, entityType: 'episode' },
    { uri: 'spotify:track:3h5T5JypYU7huFiVYhv1dr', title: 'Chega de Saudade', subtitle: 'João Gilberto', duration: 120_000, entityType: 'track' }
  ]
}

describe('SpotifyResolver: faixa', () => {
  it('pega o token (client credentials) e devolve título, artistas, capa, duração e a busca no YouTube', async () => {
    const { http, calls } = fakeSpotify({ '/api/token': tokenRoute, [`/v1/tracks/${ID}`]: () => json(trackBody) })
    expect(await new SpotifyResolver(creds, endpoints, http).resolve(track)).toEqual([
      {
        title: 'Garota de Ipanema',
        artists: ['Tom Jobim', 'Vinicius de Moraes'],
        coverUrl: 'https://i.scdn.co/capa-grande.jpg',
        durationMs: 320_000,
        url: `https://open.spotify.com/track/${ID}`,
        live: false,
        audio: { kind: 'youtube-search', query: 'Tom Jobim, Vinicius de Moraes - Garota de Ipanema' }
      }
    ])
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.body).toBe('grant_type=client_credentials')
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('id:segredo').toString('base64')}`)
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer tok-1')
  })

  it('reaproveita o token até perto de expirar', async () => {
    let now = 0
    const { http, calls } = fakeSpotify({ '/api/token': tokenRoute, [`/v1/tracks/${ID}`]: () => json(trackBody) })
    const resolver = new SpotifyResolver(creds, endpoints, http, () => now)
    await resolver.resolve(track)
    now = 3_000_000
    await resolver.resolve(track)
    expect(calls.filter((c) => c.url.endsWith('/api/token'))).toHaveLength(1)
    now = 3_600_000
    await resolver.resolve(track)
    expect(calls.filter((c) => c.url.endsWith('/api/token'))).toHaveLength(2)
  })

  it('sem capa: coverUrl null', async () => {
    const { http } = fakeSpotify({ '/api/token': tokenRoute, [`/v1/tracks/${ID}`]: () => json({ ...trackBody, album: { images: [] } }) })
    expect((await new SpotifyResolver(creds, endpoints, http).resolve(track))[0].coverUrl).toBeNull()
  })

  it('faixa que não existe: "Música não encontrada no Spotify"', async () => {
    const { http } = fakeSpotify({ '/api/token': tokenRoute })
    await expect(new SpotifyResolver(creds, endpoints, http).resolve(track)).rejects.toThrow('Música não encontrada no Spotify')
  })

  it('credenciais recusadas ou rede fora: erro de consulta', async () => {
    const refused = fakeSpotify({ '/api/token': () => json({ error: 'invalid_client' }, 401) })
    await expect(new SpotifyResolver(creds, endpoints, refused.http).resolve(track)).rejects.toThrow(/Não foi possível consultar o Spotify/)
    const offline = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    await expect(new SpotifyResolver(creds, endpoints, offline).resolve(track)).rejects.toBeInstanceOf(MusicError)
  })
})

describe('SpotifyResolver: álbum', () => {
  const albumTrack = (n: number): Record<string, unknown> => ({ name: `Faixa ${n}`, duration_ms: 1000 * n, artists: [{ name: 'Banda' }], id: `t${n}`, type: 'track' })
  const albumRoutes = (total: number): Record<string, (url: URL) => Response> => ({
    '/api/token': tokenRoute,
    [`/v1/albums/${ALBUM}`]: () =>
      json({
        name: 'Disco',
        images: [{ url: 'https://i.scdn.co/capa-disco.jpg' }],
        tracks: { items: Array.from({ length: Math.min(total, 50) }, (_, i) => albumTrack(i + 1)), total, limit: 50 }
      }),
    [`/v1/albums/${ALBUM}/tracks`]: (url) => {
      const offset = Number(url.searchParams.get('offset'))
      const limit = Number(url.searchParams.get('limit'))
      const count = Math.max(0, Math.min(limit, total - offset))
      return json({ items: Array.from({ length: count }, (_, i) => albumTrack(offset + i + 1)), total, limit })
    }
  })

  it('lê todas as páginas, com a capa do álbum em cada faixa', async () => {
    const { http, calls } = fakeSpotify(albumRoutes(120))
    const tracks = await new SpotifyResolver(creds, endpoints, http).resolve({ kind: 'spotify', type: 'album', id: ALBUM })
    expect(tracks.map((t) => t.title)).toEqual(Array.from({ length: 120 }, (_, i) => `Faixa ${i + 1}`))
    expect(tracks[119]).toMatchObject({
      coverUrl: 'https://i.scdn.co/capa-disco.jpg',
      url: 'https://open.spotify.com/track/t120',
      audio: { kind: 'youtube-search', query: 'Banda - Faixa 120' }
    })
    expect(calls.map((c) => new URL(c.url).search).filter(Boolean)).toEqual(['?offset=50&limit=50', '?offset=100&limit=50'])
  })

  it(`para em ${PLAYLIST_READ_MAX} faixas`, async () => {
    const { http } = fakeSpotify(albumRoutes(PLAYLIST_READ_MAX + 80))
    const tracks = await new SpotifyResolver(creds, endpoints, http).resolve({ kind: 'spotify', type: 'album', id: ALBUM })
    expect(tracks).toHaveLength(PLAYLIST_READ_MAX)
  })

  it('álbum que não existe: "Álbum não encontrado no Spotify"', async () => {
    const { http } = fakeSpotify({ '/api/token': tokenRoute })
    await expect(new SpotifyResolver(creds, endpoints, http).resolve({ kind: 'spotify', type: 'album', id: ALBUM })).rejects.toThrow(
      'Álbum não encontrado no Spotify'
    )
  })
})

describe('SpotifyResolver: playlist (página de incorporação)', () => {
  it('lê as faixas da página pública, sem token, ignorando episódios', async () => {
    const { http, calls } = fakeSpotify({ [`/embed/playlist/${PLAYLIST}`]: () => new Response(embedHtml(embedEntity)) })
    const tracks = await new SpotifyResolver(creds, endpoints, http).resolve({ kind: 'spotify', type: 'playlist', id: PLAYLIST })
    expect(tracks).toEqual([
      {
        title: 'Dancing In the Moonlight',
        artists: ['Bossa Nova Covers, Mats & My'],
        coverUrl: 'https://image-cdn.spotifycdn.com/capa-playlist',
        durationMs: 212_689,
        url: 'https://open.spotify.com/track/5MINUtX7hvYaaWwNRrp1hl',
        live: false,
        audio: { kind: 'youtube-search', query: 'Bossa Nova Covers, Mats & My - Dancing In the Moonlight' }
      },
      expect.objectContaining({ title: 'Chega de Saudade', url: 'https://open.spotify.com/track/3h5T5JypYU7huFiVYhv1dr' })
    ])
    expect(calls.map((c) => c.url)).toEqual([`https://embed.test/embed/playlist/${PLAYLIST}`])
  })

  it('playlist que não existe ou é privada', async () => {
    const { http } = fakeSpotify({})
    await expect(new SpotifyResolver(creds, endpoints, http).resolve({ kind: 'spotify', type: 'playlist', id: PLAYLIST })).rejects.toThrow(
      'Playlist não encontrada no Spotify (ou é privada)'
    )
  })

  it('página mudou de formato: erro claro', async () => {
    const { http } = fakeSpotify({ [`/embed/playlist/${PLAYLIST}`]: () => new Response('<html>outra coisa</html>') })
    await expect(new SpotifyResolver(creds, endpoints, http).resolve({ kind: 'spotify', type: 'playlist', id: PLAYLIST })).rejects.toThrow(
      'Não foi possível ler essa playlist do Spotify'
    )
  })
})

describe('parseSpotifyEmbed', () => {
  it('playlist vazia: lista vazia', () => {
    expect(parseSpotifyEmbed(embedHtml({ ...embedEntity, trackList: [] }))).toEqual([])
  })

  it('sem o JSON da página: null', () => {
    expect(parseSpotifyEmbed('<html></html>')).toBeNull()
    expect(parseSpotifyEmbed('<script id="__NEXT_DATA__" type="application/json">{quebrado</script>')).toBeNull()
  })
})

describe('spotifyFromEnv', () => {
  it('sem SPOTIFY_CLIENT_ID/SECRET: não configurado', () => {
    expect(spotifyFromEnv({})).toBeNull()
    expect(spotifyFromEnv({ SPOTIFY_CLIENT_ID: 'id', SPOTIFY_CLIENT_SECRET: '  ' })).toBeNull()
  })

  it('com as duas: resolvedor pronto', () => {
    expect(spotifyFromEnv({ SPOTIFY_CLIENT_ID: 'id', SPOTIFY_CLIENT_SECRET: 's' })).toBeInstanceOf(SpotifyResolver)
  })
})
