import type { SavedPlaylist } from '@shared/types'

export interface PlaylistsState {
  playlists: SavedPlaylist[]
  playlistsLoaded: boolean
}

export const playlistsInitial: PlaylistsState = {
  playlists: [],
  playlistsLoaded: false
}
