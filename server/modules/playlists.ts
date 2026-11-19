import { randomUUID } from 'node:crypto'
import { PLAYLIST_NAME_MAX, SAVED_PLAYLISTS_MAX, type MusicCollectionKind } from '../../src/shared/types'
import { allowed } from '../access'
import { guard, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { parseMusicQuery } from '../music/query'
import {
  countSavedPlaylists,
  deleteSavedPlaylist,
  findSavedPlaylist,
  findSavedPlaylistByUrl,
  insertSavedPlaylist,
  listSavedPlaylists
} from '../repo/playlists'
import { DuplicateError } from '../repo/util'

const INVALID_LINK = 'Envie o link de uma playlist ou álbum do Spotify ou do YouTube'
const INVALID_NAME = `Dê um nome à playlist (até ${PLAYLIST_NAME_MAX} caracteres)`

interface Collection {
  url: string
  kind: MusicCollectionKind
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ')
  return name.length >= 1 && name.length <= PLAYLIST_NAME_MAX ? name : null
}

function collectionOf(raw: unknown): Collection | null {
  const query = typeof raw === 'string' ? parseMusicQuery(raw) : null
  if (query?.kind === 'youtube-playlist') {
    return { kind: 'playlist', url: `https://www.youtube.com/playlist?list=${query.id}` }
  }
  if (query?.kind === 'spotify' && query.type !== 'track') {
    return { kind: query.type, url: `https://open.spotify.com/${query.type}/${query.id}` }
  }
  return null
}

export const playlistsModule: ServerModule = {
  socket(io, socket) {
    socket.on('playlist:list', (ack) => {
      if (typeof ack !== 'function') return
      void guard('playlist:list', async () => {
        if (!socket.data.user) return ack(fail('Não autenticado'))
        ack({ ok: true, playlists: await listSavedPlaylists() })
      })
    })

    socket.on('playlist:create', (request, ack) => {
      if (typeof ack !== 'function') return
      void guard('playlist:create', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        const name = cleanName(request?.name)
        if (!name) return ack(fail(INVALID_NAME))
        const collection = collectionOf(request.url)
        if (!collection) return ack(fail(INVALID_LINK))
        const limited = limiters.playlist.take(user.accountId)
        if (!limited.ok) return ack(fail(`Muitas playlists seguidas. ${retryText(limited.retryAfterMs)}`))
        if ((await countSavedPlaylists()) >= SAVED_PLAYLISTS_MAX) return ack(fail('A coleção de playlists está cheia'))
        const existing = await findSavedPlaylistByUrl(collection.url)
        if (existing) return ack(fail(`Esse link já está salvo em "${existing.name}"`))
        try {
          const playlist = await insertSavedPlaylist({ id: randomUUID(), name, ...collection, savedBy: user.accountId })
          io.emit('playlist:created', playlist)
          ack({ ok: true, playlist })
        } catch (err) {
          if (!(err instanceof DuplicateError)) throw err
          ack(fail(err.field === 'url' ? 'Esse link já está salvo' : 'Já existe uma playlist salva com esse nome'))
        }
      })
    })

    socket.on('playlist:delete', (id, ack) => {
      if (typeof ack !== 'function') return
      void guard('playlist:delete', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        const playlist = await findSavedPlaylist(id)
        if (!playlist) return ack(fail('Playlist não encontrada'))
        const mine = playlist.savedBy.accountId === user.accountId
        if (!mine && !(await allowed(user.accountId, 'manageMessages'))) {
          return ack(fail('Só quem salvou (ou quem gerencia mensagens) pode apagar esta playlist'))
        }
        await deleteSavedPlaylist(playlist.id)
        io.emit('playlist:deleted', { id: playlist.id })
        ack({ ok: true })
      })
    })
  }
}
