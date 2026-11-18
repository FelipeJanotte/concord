import type { MusicCollectionKind, MusicRequester } from './music'

export const PLAYLIST_NAME_MAX = 60
export const SAVED_PLAYLISTS_MAX = 200

export interface SavedPlaylist {
  id: string
  name: string
  url: string
  kind: MusicCollectionKind
  savedBy: MusicRequester
  createdAt: string
}

export interface SavePlaylistRequest {
  name: string
  url: string
}

export type PlaylistListResult = { ok: true; playlists: SavedPlaylist[] } | { ok: false; error: string }

export type PlaylistSaveResult = { ok: true; playlist: SavedPlaylist } | { ok: false; error: string }

export type PlaylistDeleteResult = { ok: true } | { ok: false; error: string }

export interface PlaylistsServerEvents {
  'playlist:created': (playlist: SavedPlaylist) => void
  'playlist:deleted': (payload: { id: string }) => void
}

export interface PlaylistsClientEvents {
  'playlist:list': (ack: (res: PlaylistListResult) => void) => void
  'playlist:create': (request: SavePlaylistRequest, ack: (res: PlaylistSaveResult) => void) => void
  'playlist:delete': (id: string, ack: (res: PlaylistDeleteResult) => void) => void
}
