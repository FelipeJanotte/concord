import { randomUUID } from 'node:crypto'
import { MUSIC_QUERY_MAX, type MusicResult, type MusicState } from '../../src/shared/types'
import { allowed, emitToViewers } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { INVALID_QUERY } from '../music/catalog'
import { musicDrivers, type MusicDrivers } from '../music/drivers'
import { MusicPlayer } from '../music/player'
import type { QueuedTrack, TrackMetadata } from '../music/ports'
import { onVoiceRoomsChange, voiceChannelOf, voiceSocketsIn } from './voice'

const NOT_CONFIGURED = 'Bot de música não configurado neste servidor'
const NOT_IN_ROOM = 'Entre na sala de voz para controlar a música'

let drivers: MusicDrivers | null = null
let player: MusicPlayer | null = null

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
const ok = (state: MusicState): MusicResult => ({ ok: true, state })

function leaveEmptyRooms(): void {
  for (const channelId of player?.activeRooms() ?? []) {
    if (voiceSocketsIn(channelId).length === 0) player?.stop(channelId)
  }
}

async function roomInControl(socket: AppSocket, channelId: unknown): Promise<string | null> {
  const accountId = socket.data.user?.accountId
  if (!accountId || typeof channelId !== 'string' || voiceChannelOf(socket.id) !== channelId) return null
  const access = (await allowed(accountId, 'view', channelId)) && (await allowed(accountId, 'connect', channelId))
  return access ? channelId : null
}

const validQuery = (query: unknown): query is string => typeof query === 'string' && query.trim().length > 0 && query.length <= MUSIC_QUERY_MAX

function queued(track: TrackMetadata, requestedBy: QueuedTrack['requestedBy']): QueuedTrack {
  const { title, artists, coverUrl, durationMs, url, audio } = track
  return { id: randomUUID(), title, artists, coverUrl, durationMs, url, audio, requestedBy }
}

function rateLimited(accountId: string): string | null {
  const limited = limiters.music.take(accountId)
  return limited.ok ? null : `Muitos comandos de música seguidos. ${retryText(limited.retryAfterMs)}`
}

export const musicModule: ServerModule = {
  init(io: AppServer) {
    drivers = musicDrivers()
    if (!drivers) return
    player = new MusicPlayer(drivers, (state) => void emitToViewers(io, state.channelId, 'music:state', state))
    onVoiceRoomsChange(leaveEmptyRooms)
  },

  socket(_io, socket) {
    socket.on('music:play', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('music:play', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        if (!drivers || !player) return ack(fail(NOT_CONFIGURED))
        const channelId = await roomInControl(socket, payload?.channelId)
        if (!channelId) return ack(fail(NOT_IN_ROOM))
        const query = payload.query
        if (!validQuery(query)) return ack(fail(INVALID_QUERY))
        const limited = rateLimited(user.accountId)
        if (limited) return ack(fail(limited))
        const found = await drivers.catalog.find(query)
        if (!found.ok) return ack(found)
        if (voiceChannelOf(socket.id) !== channelId) return ack(fail(NOT_IN_ROOM))
        const requestedBy = { accountId: user.accountId, name: user.name }
        const added = player.add(channelId, found.tracks.map((track) => queued(track, requestedBy)))
        ack(added.ok ? { ok: true, state: player.state(channelId), added: added.added } : fail(added.error))
      })
    })

    const control = (event: 'music:skip' | 'music:stop', act: (p: MusicPlayer, channelId: string) => boolean, idle: string) => {
      socket.on(event, (requested, ack) => {
        if (typeof ack !== 'function') return
        void guard(event, async () => {
          const user = socket.data.user
          if (!user) return ack(fail('Não autenticado'))
          if (!player) return ack(fail(NOT_CONFIGURED))
          const channelId = await roomInControl(socket, requested)
          if (!channelId) return ack(fail(NOT_IN_ROOM))
          const limited = rateLimited(user.accountId)
          if (limited) return ack(fail(limited))
          if (!act(player, channelId)) return ack(fail(idle))
          ack(ok(player.state(channelId)))
        })
      })
    }
    control('music:skip', (p, id) => p.skip(id), 'Nenhuma música tocando')
    control('music:stop', (p, id) => p.stop(id), 'Nenhuma música tocando')

    socket.on('music:queue', (channelId, ack) => {
      if (typeof ack !== 'function') return
      void guard('music:queue', async () => {
        const accountId = socket.data.user?.accountId
        if (!accountId) return ack(fail('Não autenticado'))
        if (typeof channelId !== 'string' || !(await allowed(accountId, 'view', channelId))) return ack(fail('Canal de voz não encontrado'))
        if (!player) return ack(fail(NOT_CONFIGURED))
        ack(ok(player.state(channelId)))
      })
    })
  }
}
