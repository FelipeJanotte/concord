import { describe, expect, it } from 'vitest'
import { MusicError } from './ports'
import { NOT_A_SPOTIFY_TRACK, SpotifyResolver, spotifyFromEnv, spotifyTrackId } from './spotify'

const ID = '4uLU6hMCjMI75M1A2tKUQC'

describe('spotifyTrackId', () => {
  it.each([
    [`https://open.spotify.com/track/${ID}`],
    [`https://open.spotify.com/track/${ID}?si=abc123`],
    [`https://open.spotify.com/intl-pt/track/${ID}`],
    [`https://open.spotify.com/intl-pt-br/track/${ID}?si=x`],
    [`http://open.spotify.com/track/${ID}/`],
    [`  spotify:track:${ID}  `]
  ])('aceita %s', (url) => {
    expect(spotifyTrackId(url)).toBe(ID)
  })

  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ'],
    [`https://open.spotify.com/album/${ID}`],
    [`https://open.spotify.com/playlist/${ID}`],
    [`https://open.spotify.com.evil.com/track/${ID}`],
    [`https://evil.com/open.spotify.com/track/${ID}`],
    [`https://user@open.spotify.com/track/${ID}`],
    [`https://open.spotify.com:8443/track/${ID}`],
    [`ftp://open.spotify.com/track/${ID}`],
    [`https://open.spotify.com/xx/track/${ID}`],
    ['https://open.spotify.com/track/curto'],
    [`spotify:album:${ID}`],
    ['spotify:track:curto'],
    ['não é link'],
    ['']
  ])('recusa %s', (url) => {
    expect(spotifyTrackId(url)).toBeNull()
  })
})

interface Call {
  url: string
  init: RequestInit
}

function fakeSpotify(routes: Record<string, () => Response>): { http: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const http = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const path = new URL(url).pathname
    const route = routes[path]
    return route ? route() : new Response('{}', { status: 404 })
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
const endpoints = { accounts: 'https://contas.test', api: 'https://api.test' }
const creds = { clientId: 'id', clientSecret: 'segredo' }

describe('SpotifyResolver', () => {
  it('pega o token (client credentials) e devolve título, artistas, capa e duração', async () => {
    const { http, calls } = fakeSpotify({ '/api/token': tokenRoute, [`/v1/tracks/${ID}`]: () => json(trackBody) })
    const track = await new SpotifyResolver(creds, endpoints, http).resolve(`https://open.spotify.com/intl-pt/track/${ID}?si=1`)
    expect(track).toEqual({
      title: 'Garota de Ipanema',
      artists: ['Tom Jobim', 'Vinicius de Moraes'],
      coverUrl: 'https://i.scdn.co/capa-grande.jpg',
      durationMs: 320_000,
      url: `https://open.spotify.com/track/${ID}`
    })
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.body).toBe('grant_type=client_credentials')
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('id:segredo').toString('base64')}`)
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer tok-1')
  })

  it('reaproveita o token até perto de expirar', async () => {
    let now = 0
    const { http, calls } = fakeSpotify({ '/api/token': tokenRoute, [`/v1/tracks/${ID}`]: () => json(trackBody) })
    const resolver = new SpotifyResolver(creds, endpoints, http, () => now)
    await resolver.resolve(`spotify:track:${ID}`)
    now = 3_000_000
    await resolver.resolve(`spotify:track:${ID}`)
    expect(calls.filter((c) => c.url.endsWith('/api/token'))).toHaveLength(1)
    now = 3_600_000
    await resolver.resolve(`spotify:track:${ID}`)
    expect(calls.filter((c) => c.url.endsWith('/api/token'))).toHaveLength(2)
  })

  it('sem capa: coverUrl null', async () => {
    const { http } = fakeSpotify({ '/api/token': tokenRoute, [`/v1/tracks/${ID}`]: () => json({ ...trackBody, album: { images: [] } }) })
    expect((await new SpotifyResolver(creds, endpoints, http).resolve(`spotify:track:${ID}`)).coverUrl).toBeNull()
  })

  it('link que não é faixa do Spotify: erro sem chamar a API', async () => {
    const { http, calls } = fakeSpotify({})
    await expect(new SpotifyResolver(creds, endpoints, http).resolve('https://youtu.be/dQw4w9WgXcQ')).rejects.toThrow(
      new MusicError(NOT_A_SPOTIFY_TRACK)
    )
    expect(calls).toHaveLength(0)
  })

  it('faixa que não existe: "Música não encontrada no Spotify"', async () => {
    const { http } = fakeSpotify({ '/api/token': tokenRoute })
    await expect(new SpotifyResolver(creds, endpoints, http).resolve(`spotify:track:${ID}`)).rejects.toThrow('Música não encontrada no Spotify')
  })

  it('credenciais recusadas ou rede fora: erro de consulta', async () => {
    const refused = fakeSpotify({ '/api/token': () => json({ error: 'invalid_client' }, 401) })
    await expect(new SpotifyResolver(creds, endpoints, refused.http).resolve(`spotify:track:${ID}`)).rejects.toThrow(/Não foi possível consultar o Spotify/)
    const offline = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    await expect(new SpotifyResolver(creds, endpoints, offline).resolve(`spotify:track:${ID}`)).rejects.toBeInstanceOf(MusicError)
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
