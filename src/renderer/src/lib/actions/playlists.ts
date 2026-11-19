import type { SavedPlaylist } from '@shared/types'
import { get, requireSocket, set, type AppSocket } from '../core'

function addPlaylist(playlist: SavedPlaylist): void {
  const playlists = get().playlists
  if (playlists.some((p) => p.id === playlist.id)) return
  set({ playlists: [...playlists, playlist] })
}

function removePlaylist(id: string): void {
  set({ playlists: get().playlists.filter((p) => p.id !== id) })
}

export function bindPlaylistsEvents(s: AppSocket): void {
  s.on('playlist:created', addPlaylist)
  s.on('playlist:deleted', ({ id }) => removePlaylist(id))
}

export async function loadPlaylists(): Promise<void> {
  const res = await requireSocket().emitWithAck('playlist:list')
  if (!res.ok) throw new Error(res.error)
  set({ playlists: res.playlists, playlistsLoaded: true })
}

export async function savePlaylist(name: string, url: string): Promise<SavedPlaylist> {
  const res = await requireSocket().emitWithAck('playlist:create', { name, url })
  if (!res.ok) throw new Error(res.error)
  addPlaylist(res.playlist)
  return res.playlist
}

export async function deletePlaylist(id: string): Promise<void> {
  const res = await requireSocket().emitWithAck('playlist:delete', id)
  if (!res.ok) throw new Error(res.error)
  removePlaylist(id)
}
