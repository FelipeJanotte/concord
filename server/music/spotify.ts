import { MusicError, type TrackMetadata, type TrackResolver } from './ports'

const TRACK_ID = /^[A-Za-z0-9]{22}$/
const LOCALE_SEGMENT = /^intl-[a-z]{2}(-[a-z]{2})?$/i
const TOKEN_MARGIN_MS = 60_000

export const NOT_A_SPOTIFY_TRACK = 'Envie um link de música do Spotify (open.spotify.com/track/...)'
const SPOTIFY_UNAVAILABLE = 'Não foi possível consultar o Spotify. Tente de novo.'
const TRACK_NOT_FOUND = 'Música não encontrada no Spotify'

export function spotifyTrackId(input: string): string | null {
  const text = input.trim()
  const uri = /^spotify:track:([A-Za-z0-9]+)$/.exec(text)
  if (uri) return TRACK_ID.test(uri[1]) ? uri[1] : null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.hostname !== 'open.spotify.com' || url.username || url.password || url.port) return null
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 3 && LOCALE_SEGMENT.test(segments[0])) segments.shift()
  if (segments.length !== 2 || segments[0] !== 'track') return null
  return TRACK_ID.test(segments[1]) ? segments[1] : null
}

export interface SpotifyCredentials {
  clientId: string
  clientSecret: string
}

export interface SpotifyEndpoints {
  accounts: string
  api: string
}

export const SPOTIFY_ENDPOINTS: SpotifyEndpoints = {
  accounts: 'https://accounts.spotify.com',
  api: 'https://api.spotify.com'
}

interface SpotifyTrack {
  name: string
  duration_ms: number
  artists: { name: string }[]
  album?: { images?: { url: string }[] }
  external_urls?: { spotify?: string }
}

export class SpotifyResolver implements TrackResolver {
  private token: { value: string; expiresAt: number } | null = null

  constructor(
    private readonly credentials: SpotifyCredentials,
    private readonly endpoints: SpotifyEndpoints = SPOTIFY_ENDPOINTS,
    private readonly http: typeof fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  async resolve(url: string): Promise<TrackMetadata> {
    const id = spotifyTrackId(url)
    if (!id) throw new MusicError(NOT_A_SPOTIFY_TRACK)
    const res = await this.request(`${this.endpoints.api}/v1/tracks/${id}`, {
      headers: { authorization: `Bearer ${await this.accessToken()}` }
    })
    if (res.status === 404 || res.status === 400) throw new MusicError(TRACK_NOT_FOUND)
    if (!res.ok) throw new MusicError(SPOTIFY_UNAVAILABLE)
    const track = (await res.json()) as SpotifyTrack
    return {
      title: track.name,
      artists: track.artists.map((a) => a.name),
      coverUrl: track.album?.images?.[0]?.url ?? null,
      durationMs: track.duration_ms,
      url: track.external_urls?.spotify ?? `https://open.spotify.com/track/${id}`
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value
    const basic = Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString('base64')
    const res = await this.request(`${this.endpoints.accounts}/api/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials'
    })
    if (!res.ok) throw new MusicError(SPOTIFY_UNAVAILABLE)
    const body = (await res.json()) as { access_token: string; expires_in: number }
    this.token = { value: body.access_token, expiresAt: this.now() + body.expires_in * 1000 - TOKEN_MARGIN_MS }
    return body.access_token
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.http(url, init)
    } catch {
      throw new MusicError(SPOTIFY_UNAVAILABLE)
    }
  }
}

export function spotifyFromEnv(env: NodeJS.ProcessEnv): SpotifyResolver | null {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim()
  const clientSecret = env.SPOTIFY_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return new SpotifyResolver(
    { clientId, clientSecret },
    {
      accounts: env.SPOTIFY_ACCOUNTS_URL?.trim() || SPOTIFY_ENDPOINTS.accounts,
      api: env.SPOTIFY_API_URL?.trim() || SPOTIFY_ENDPOINTS.api
    }
  )
}
