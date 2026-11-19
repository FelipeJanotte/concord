import { MusicError, PLAYLIST_READ_MAX, type MusicQuery, type Resolved, type TrackMetadata, type TrackResolver } from './ports'

export type SpotifyQuery = Extract<MusicQuery, { kind: 'spotify' }>

const TOKEN_MARGIN_MS = 60_000
const ALBUM_PAGE = 50
const EMBED_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
const TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/
const SPOTIFY_UNAVAILABLE = 'Não foi possível consultar o Spotify. Tente de novo.'

export interface SpotifyCredentials {
  clientId: string
  clientSecret: string
}

export interface SpotifyEndpoints {
  accounts: string
  api: string
  embed: string
}

export const SPOTIFY_ENDPOINTS: SpotifyEndpoints = {
  accounts: 'https://accounts.spotify.com',
  api: 'https://api.spotify.com',
  embed: 'https://open.spotify.com'
}

interface SpotifyImage {
  url: string
}

interface SpotifyTrack {
  id?: string
  name: string
  duration_ms: number
  artists: { name: string }[]
  album?: { images?: SpotifyImage[] }
  external_urls?: { spotify?: string }
}

interface TrackPage {
  items: SpotifyTrack[]
  total: number
}

interface SpotifyAlbum {
  name?: string
  images?: SpotifyImage[]
  tracks: TrackPage
}

interface EmbedTrack {
  uri?: unknown
  title?: unknown
  subtitle?: unknown
  duration?: unknown
  entityType?: unknown
}

interface Listing {
  title: string
  artists: string[]
  durationMs: number
  url: string
  coverUrl: string | null
}

function youtubeQuery(title: string, artists: string[]): string {
  const lead = artists[0]?.split(', ')[0]
  return lead ? `${lead} - ${title}` : title
}

function listed({ title, artists, durationMs, url, coverUrl }: Listing): TrackMetadata {
  return { title, artists, coverUrl, durationMs, url, live: false, audio: { kind: 'youtube-search', query: youtubeQuery(title, artists) } }
}

const trackUrl = (id: string): string => `https://open.spotify.com/track/${id}`

function fromApi(track: SpotifyTrack, coverUrl: string | null): TrackMetadata {
  return listed({
    title: track.name,
    artists: track.artists.map((a) => a.name),
    durationMs: track.duration_ms,
    url: track.external_urls?.spotify ?? (track.id ? trackUrl(track.id) : ''),
    coverUrl
  })
}

function fromEmbed(item: EmbedTrack, coverUrl: string | null): TrackMetadata | null {
  const id = typeof item.uri === 'string' ? TRACK_URI.exec(item.uri)?.[1] : undefined
  if (item.entityType !== 'track' || !id || typeof item.title !== 'string') return null
  return listed({
    title: item.title,
    artists: typeof item.subtitle === 'string' && item.subtitle ? [item.subtitle] : [],
    durationMs: typeof item.duration === 'number' ? item.duration : 0,
    url: trackUrl(id),
    coverUrl
  })
}

const named = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

export function parseSpotifyEmbed(html: string): Resolved | null {
  const data = EMBED_DATA.exec(html)?.[1]
  if (!data) return null
  let entity: { name?: unknown; title?: unknown; trackList?: unknown; coverArt?: { sources?: SpotifyImage[] } } | undefined
  try {
    entity = JSON.parse(data)?.props?.pageProps?.state?.data?.entity
  } catch {
    return null
  }
  if (!entity || !Array.isArray(entity.trackList)) return null
  const coverUrl = entity.coverArt?.sources?.[0]?.url ?? null
  const tracks = (entity.trackList as EmbedTrack[]).flatMap((item) => fromEmbed(item, coverUrl) ?? [])
  return { tracks, collectionTitle: named(entity.name) ?? named(entity.title) }
}

export class SpotifyResolver implements TrackResolver<SpotifyQuery> {
  private token: { value: string; expiresAt: number } | null = null

  constructor(
    private readonly credentials: SpotifyCredentials,
    private readonly endpoints: SpotifyEndpoints = SPOTIFY_ENDPOINTS,
    private readonly http: typeof fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  async resolve(query: SpotifyQuery): Promise<Resolved> {
    if (query.type === 'track') return { tracks: [await this.track(query.id)], collectionTitle: null }
    if (query.type === 'album') return this.album(query.id)
    return this.playlist(query.id)
  }

  private async track(id: string): Promise<TrackMetadata> {
    const track = await this.api<SpotifyTrack>(`/v1/tracks/${id}`, 'Música não encontrada no Spotify')
    return fromApi(track, track.album?.images?.[0]?.url ?? null)
  }

  private async album(id: string): Promise<Resolved> {
    const notFound = 'Álbum não encontrado no Spotify'
    const album = await this.api<SpotifyAlbum>(`/v1/albums/${id}`, notFound)
    const items = [...album.tracks.items]
    const total = Math.min(album.tracks.total, PLAYLIST_READ_MAX)
    while (items.length < total) {
      const page = await this.api<TrackPage>(`/v1/albums/${id}/tracks?offset=${items.length}&limit=${ALBUM_PAGE}`, notFound)
      if (!page.items.length) break
      items.push(...page.items)
    }
    const coverUrl = album.images?.[0]?.url ?? null
    return { tracks: items.slice(0, PLAYLIST_READ_MAX).map((track) => fromApi(track, coverUrl)), collectionTitle: named(album.name) }
  }

  private async playlist(id: string): Promise<Resolved> {
    const res = await this.request(`${this.endpoints.embed}/embed/playlist/${id}`, { headers: { 'user-agent': 'Mozilla/5.0' } })
    if (res.status === 404 || res.status === 400) throw new MusicError('Playlist não encontrada no Spotify (ou é privada)')
    if (!res.ok) throw new MusicError(SPOTIFY_UNAVAILABLE)
    const playlist = parseSpotifyEmbed(await res.text())
    if (!playlist) throw new MusicError('Não foi possível ler essa playlist do Spotify')
    return { ...playlist, tracks: playlist.tracks.slice(0, PLAYLIST_READ_MAX) }
  }

  private async api<T>(path: string, notFound: string): Promise<T> {
    const res = await this.request(`${this.endpoints.api}${path}`, { headers: { authorization: `Bearer ${await this.accessToken()}` } })
    if (res.status === 404 || res.status === 400) throw new MusicError(notFound)
    if (!res.ok) throw new MusicError(SPOTIFY_UNAVAILABLE)
    return (await res.json()) as T
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
      api: env.SPOTIFY_API_URL?.trim() || SPOTIFY_ENDPOINTS.api,
      embed: env.SPOTIFY_EMBED_URL?.trim() || SPOTIFY_ENDPOINTS.embed
    }
  )
}
