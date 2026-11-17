import type { MusicQuery, SpotifyKind } from './ports'

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/
const SPOTIFY_KINDS: readonly string[] = ['track', 'playlist', 'album'] satisfies SpotifyKind[]
const SPOTIFY_URI = /^spotify:([a-z]+):([A-Za-z0-9]+)$/
const LOCALE_SEGMENT = /^intl-[a-z]{2}(-[a-z]{2})?$/i
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])
const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const BARE_HOST = /^[\w-]+(\.[\w-]+)+(\/|$)/

export function parseMusicQuery(input: string): MusicQuery | null {
  const text = input.trim().replace(/\s+/g, ' ')
  if (!text) return null
  if (text.startsWith('spotify:')) return spotifyUri(text)
  if (SCHEME.test(text)) return fromUrl(text)
  if (!text.includes(' ') && BARE_HOST.test(text)) return fromUrl(`https://${text}`)
  return { kind: 'search', text }
}

function spotifyUri(text: string): MusicQuery | null {
  const match = SPOTIFY_URI.exec(text)
  return match ? spotify(match[1], match[2]) : null
}

function spotify(type: string, id: string): MusicQuery | null {
  if (!SPOTIFY_KINDS.includes(type) || !SPOTIFY_ID.test(id)) return null
  return { kind: 'spotify', type: type as SpotifyKind, id }
}

function fromUrl(text: string): MusicQuery | null {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.port) return null
  const segments = url.pathname.split('/').filter(Boolean)
  if (url.hostname === 'open.spotify.com') return spotifyUrl(segments)
  if (url.hostname === 'youtu.be') return segments.length === 1 ? youtubeVideo(segments[0]) : null
  if (YOUTUBE_HOSTS.has(url.hostname)) return youtubeUrl(segments, url.searchParams)
  return null
}

function spotifyUrl(segments: string[]): MusicQuery | null {
  if (segments.length === 3 && LOCALE_SEGMENT.test(segments[0])) segments.shift()
  return segments.length === 2 ? spotify(segments[0], segments[1]) : null
}

function youtubeVideo(id: string | null | undefined): MusicQuery | null {
  return id && VIDEO_ID.test(id) ? { kind: 'youtube-video', id } : null
}

function youtubeUrl(segments: string[], params: URLSearchParams): MusicQuery | null {
  const [page, id] = segments
  if (segments.length === 1 && page === 'watch') return youtubeVideo(params.get('v'))
  if (segments.length === 2 && page === 'shorts') return youtubeVideo(id)
  if (segments.length === 1 && page === 'playlist') {
    const list = params.get('list')
    return list && LIST_ID.test(list) ? { kind: 'youtube-playlist', id: list } : null
  }
  return null
}
