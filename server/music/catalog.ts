import { MUSIC_MAX_TRACK_MS, type MusicCollection } from '../../src/shared/types'
import { MusicError, type MusicQuery, type Resolved, type TrackMetadata, type TrackResolver } from './ports'
import { parseMusicQuery } from './query'
import type { SpotifyQuery } from './spotify'
import type { YouTubeQuery } from './youtube'

export type FindResult = { ok: true; tracks: TrackMetadata[]; collection: MusicCollection | null } | { ok: false; error: string }

export const INVALID_QUERY = 'Envie o nome da música ou um link do Spotify ou do YouTube'
const MAX_MINUTES = MUSIC_MAX_TRACK_MS / 60_000

function unplayable(track: TrackMetadata): string | null {
  if (track.live) return 'Transmissões ao vivo não podem ser tocadas'
  if (track.durationMs <= 0) return 'Não foi possível saber a duração dessa música'
  if (track.durationMs > MUSIC_MAX_TRACK_MS) return `Música longa demais (máximo de ${MAX_MINUTES} min)`
  return null
}

type CollectionQuery = Extract<MusicQuery, { kind: 'youtube-playlist' }> | (Extract<MusicQuery, { kind: 'spotify' }> & { type: 'playlist' | 'album' })

const isCollection = (query: MusicQuery): query is CollectionQuery =>
  query.kind === 'youtube-playlist' || (query.kind === 'spotify' && query.type !== 'track')

function collectionOf(query: CollectionQuery, title: string | null): MusicCollection {
  if (query.kind === 'youtube-playlist') {
    const url = `https://www.youtube.com/playlist?list=${query.id}`
    return { kind: 'playlist', title: title ?? url, url }
  }
  const url = `https://open.spotify.com/${query.type}/${query.id}`
  return { kind: query.type, title: title ?? url, url }
}

export class MusicCatalog {
  constructor(
    private readonly spotify: TrackResolver<SpotifyQuery> | null,
    private readonly youtube: TrackResolver<YouTubeQuery>
  ) {}

  async find(text: string): Promise<FindResult> {
    const query = parseMusicQuery(text)
    if (!query) return { ok: false, error: INVALID_QUERY }
    let resolved: Resolved
    try {
      resolved = await this.lookUp(query)
    } catch (err) {
      if (err instanceof MusicError) return { ok: false, error: err.message }
      console.warn('[música] falha ao buscar:', err)
      return { ok: false, error: 'Não foi possível buscar a música. Tente de novo.' }
    }
    const { tracks } = resolved
    if (isCollection(query)) {
      const playable = tracks.filter((t) => !unplayable(t))
      if (!playable.length) return { ok: false, error: `Nenhuma música da lista pode ser tocada (ao vivo, sem duração ou acima de ${MAX_MINUTES} min)` }
      return { ok: true, tracks: playable, collection: collectionOf(query, resolved.collectionTitle) }
    }
    const reason = unplayable(tracks[0])
    return reason ? { ok: false, error: reason } : { ok: true, tracks: tracks.slice(0, 1), collection: null }
  }

  private lookUp(query: MusicQuery): Promise<Resolved> {
    if (query.kind !== 'spotify') return this.youtube.resolve(query)
    if (!this.spotify) throw new MusicError('Links do Spotify não estão configurados neste servidor')
    return this.spotify.resolve(query)
  }
}
