import { execFile } from 'node:child_process'
import { MusicError, PLAYLIST_READ_MAX, type MusicQuery, type Resolved, type TrackMetadata, type TrackResolver } from './ports'

export type YouTubeQuery = Extract<MusicQuery, { kind: 'youtube-video' | 'youtube-playlist' | 'search' }>
export type YtDlpJson = (args: string[]) => Promise<unknown>
export type ExecFileLike = (
  file: string,
  args: string[],
  options: { maxBuffer: number; timeout: number; windowsHide: boolean },
  callback: (err: (Error & { code?: unknown }) | null, stdout: string, stderr: string) => void
) => void

export const YOUTUBE_UNAVAILABLE = 'Não foi possível ler isso no YouTube (vídeo indisponível ou privado?)'
const YTDLP_MAX_BUFFER = 32 * 1024 * 1024
const YTDLP_TIMEOUT_MS = 60_000
const LIVE_STATUSES = new Set(['is_live', 'is_upcoming'])
const TOPIC_SUFFIX = / - Topic$/
export const SKIP_HLS = ['--extractor-args', 'youtube:skip=hls']
export const NODE_JS_RUNTIME = ['--js-runtimes', `node:${process.execPath}`]
const PLAYER_ARGS = ['-J', '--no-playlist', '--no-warnings', '--ignore-no-formats-error', ...SKIP_HLS]
const FLAT_LIST_ARGS = ['-J', '--flat-playlist', '--no-warnings']

const watchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

function largestThumbnail(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const urls = value.filter(isObject).map((t) => text(t.url))
  return urls.filter((u): u is string => u !== null).at(-1) ?? null
}

function trackFrom(json: Json, url: string): TrackMetadata {
  const artist = text(json.artist) ?? text(json.channel) ?? text(json.uploader)
  const seconds = typeof json.duration === 'number' && json.duration > 0 ? json.duration : 0
  return {
    title: text(json.title) ?? url,
    artists: artist ? [artist.replace(TOPIC_SUFFIX, '')] : [],
    coverUrl: text(json.thumbnail) ?? largestThumbnail(json.thumbnails),
    durationMs: Math.round(seconds * 1000),
    url,
    live: json.is_live === true || LIVE_STATUSES.has(String(json.live_status)),
    audio: { kind: 'audio-url', url }
  }
}

export function parseYtDlpVideo(json: unknown): TrackMetadata {
  const id = isObject(json) ? text(json.id) : null
  if (!isObject(json) || !id) throw new MusicError(YOUTUBE_UNAVAILABLE)
  return trackFrom(json, text(json.webpage_url) ?? watchUrl(id))
}

export function parseYtDlpEntries(json: unknown): TrackMetadata[] {
  const entries = isObject(json) && Array.isArray(json.entries) ? json.entries : []
  return entries.filter(isObject).flatMap((entry) => {
    const id = text(entry.id)
    return id ? [trackFrom(entry, watchUrl(id))] : []
  })
}

export function ytDlpRunner(ytDlp: string, exec: ExecFileLike = execFile as unknown as ExecFileLike): YtDlpJson {
  return (args) =>
    new Promise((resolve, reject) => {
      exec(ytDlp, [...NODE_JS_RUNTIME, ...args], { maxBuffer: YTDLP_MAX_BUFFER, timeout: YTDLP_TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
        if (err?.code === 'ENOENT') return reject(new MusicError('yt-dlp não encontrado no servidor'))
        if (err) return reject(new MusicError(YOUTUBE_UNAVAILABLE))
        try {
          resolve(JSON.parse(stdout))
        } catch {
          reject(new MusicError(YOUTUBE_UNAVAILABLE))
        }
      })
    })
}

export class YouTubeResolver implements TrackResolver<YouTubeQuery> {
  constructor(private readonly ytDlp: YtDlpJson) {}

  async resolve(query: YouTubeQuery): Promise<Resolved> {
    if (query.kind === 'youtube-video') {
      return { tracks: [parseYtDlpVideo(await this.ytDlp([...PLAYER_ARGS, watchUrl(query.id)]))], collectionTitle: null }
    }
    if (query.kind === 'youtube-playlist') {
      const playlistUrl = `https://www.youtube.com/playlist?list=${query.id}`
      const listing = await this.ytDlp([...FLAT_LIST_ARGS, '--playlist-end', String(PLAYLIST_READ_MAX), playlistUrl])
      const tracks = parseYtDlpEntries(listing)
      if (!tracks.length) throw new MusicError('Playlist do YouTube vazia ou privada')
      return { tracks, collectionTitle: isObject(listing) ? text(listing.title) : null }
    }
    const [first] = parseYtDlpEntries(await this.ytDlp([...FLAT_LIST_ARGS, `ytsearch1:${query.text}`]))
    if (!first) throw new MusicError(`Nada encontrado no YouTube para "${query.text}"`)
    return { tracks: [first], collectionTitle: null }
  }
}
