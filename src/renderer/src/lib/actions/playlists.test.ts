import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SavedPlaylist } from '@shared/types'
import { bindPlaylistsEvents, deletePlaylist, loadPlaylists, savePlaylist } from '@/lib/actions/playlists'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const playlist = (id: string, name: string): SavedPlaylist => ({
  id,
  name,
  url: `https://open.spotify.com/playlist/${id}`,
  kind: 'playlist',
  savedBy: { accountId: 'acc-ana', name: 'Ana' },
  createdAt: '2026-11-18T00:00:00.000Z'
})

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  useApp.setState({ ...initialState })
  bindPlaylistsEvents(socket.asSocket())
})

afterEach(() => setSocket(null))

describe('playlists salvas', () => {
  it('loadPlaylists guarda a coleção da comunidade', async () => {
    socket.replyTo('playlist:list', () => ({ ok: true, playlists: [playlist('p1', 'Bossa')] }))
    expect(useApp.getState().playlistsLoaded).toBe(false)
    await loadPlaylists()
    expect(useApp.getState()).toMatchObject({ playlists: [playlist('p1', 'Bossa')], playlistsLoaded: true })
  })

  it('savePlaylist manda nome e link e entra na lista uma vez só, mesmo com o playlist:created de volta', async () => {
    socket.replyTo('playlist:create', () => ({ ok: true, playlist: playlist('p2', 'Samba') }))
    await savePlaylist('Samba', 'https://open.spotify.com/playlist/p2')
    socket.receive('playlist:created', playlist('p2', 'Samba'))
    expect(socket.sent('playlist:create')).toEqual([[{ name: 'Samba', url: 'https://open.spotify.com/playlist/p2' }]])
    expect(useApp.getState().playlists).toEqual([playlist('p2', 'Samba')])
  })

  it('erro ao salvar vira exceção com a mensagem do servidor', async () => {
    socket.replyTo('playlist:create', () => ({ ok: false, error: 'Esse link já está salvo' }))
    await expect(savePlaylist('Samba', 'x')).rejects.toThrow('Esse link já está salvo')
    expect(useApp.getState().playlists).toEqual([])
  })

  it('deletePlaylist tira da lista; playlist:deleted de outra pessoa também', async () => {
    useApp.setState({ playlists: [playlist('p1', 'Bossa'), playlist('p2', 'Samba')] })
    socket.replyTo('playlist:delete', () => ({ ok: true }))
    await deletePlaylist('p1')
    expect(socket.sent('playlist:delete')).toEqual([['p1']])
    socket.receive('playlist:deleted', { id: 'p2' })
    expect(useApp.getState().playlists).toEqual([])
  })

  it('erro ao apagar vira exceção e a lista fica', async () => {
    useApp.setState({ playlists: [playlist('p1', 'Bossa')] })
    socket.replyTo('playlist:delete', () => ({ ok: false, error: 'Playlist não encontrada' }))
    await expect(deletePlaylist('p1')).rejects.toThrow('Playlist não encontrada')
    expect(useApp.getState().playlists).toHaveLength(1)
  })
})
