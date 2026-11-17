import { randomUUID } from 'node:crypto'
import {
  MUSIC_QUERY_MAX,
  toolResultText,
  type Channel,
  type Message,
  type MusicBotReply,
  type MusicControl,
  type MusicResult,
  type MusicState,
  type MusicTrackSummary,
  type ToolPayload,
  type User
} from '../../src/shared/types'
import { allowed, emitToViewers } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { INVALID_QUERY } from '../music/catalog'
import { parseMusicQuery } from '../music/query'
import { musicDrivers, type MusicDrivers } from '../music/drivers'
import { MusicPlayer } from '../music/player'
import type { QueuedTrack, TrackMetadata } from '../music/ports'
import { findChannel } from '../repo/channels'
import { insertMessage, resolveMentions, updateToolMessage } from '../repo/messages'
import { mentionSafeContent } from './messages'
import { onVoiceRoomsChange, voiceChannelOf, voiceSocketsIn } from './voice'

const NOT_CONFIGURED = 'Bot de música não configurado neste servidor'
const NOT_IN_ROOM = 'Entre na sala de voz para controlar a música'
const NOTHING_PLAYING = 'Nenhuma música tocando'
const CHAT_NOT_FOUND = 'Canal não encontrado'
const CANNOT_SEND = 'Você não tem permissão para enviar mensagens neste canal'

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

const controlOf = (raw: unknown): Partial<MusicControl> => (typeof raw === 'string' ? { channelId: raw } : ((raw ?? {}) as Partial<MusicControl>))

type CommandChat = { ok: true; channel: Channel | null } | { ok: false; error: string }

async function commandChat(accountId: string, textChannelId: unknown): Promise<CommandChat> {
  if (textChannelId === undefined) return { ok: true, channel: null }
  const channel = typeof textChannelId === 'string' ? await findChannel(textChannelId) : undefined
  if (!channel || !(await allowed(accountId, 'view', channel.id))) return fail(CHAT_NOT_FOUND)
  if (!(await allowed(accountId, 'send', channel.id))) return fail(CANNOT_SEND)
  return { ok: true, channel }
}

const summary = ({ title, artists, coverUrl }: MusicTrackSummary): MusicTrackSummary => ({ title, artists, coverUrl })

function chatMessage(user: User, channelId: string, content: string): Message {
  return { id: randomUUID(), channelId, author: { ...user }, content, attachments: [], createdAt: Date.now() }
}

const botPayload = (reply: MusicBotReply): ToolPayload => ({ tool: 'music', result: reply })

async function postToChat(io: AppServer, user: User, channel: Channel | null, command: string, reply: MusicBotReply): Promise<Message | null> {
  if (!channel) return null
  const content = await mentionSafeContent(user.accountId, channel.type, command)
  const said = await insertMessage(chatMessage(user, channel.id, content))
  if (said) await emitToViewers(io, channel.id, 'message:new', { ...said, ...(await resolveMentions(content)) })
  const tool = botPayload(reply)
  const answer = await insertMessage({ ...chatMessage(user, channel.id, toolResultText(tool)), kind: 'tool', tool })
  if (answer) await emitToViewers(io, channel.id, 'message:new', answer)
  return answer
}

async function replaceBotReply(io: AppServer, answer: Message, reply: MusicBotReply): Promise<void> {
  const tool = botPayload(reply)
  const content = toolResultText(tool)
  if (await updateToolMessage(answer.id, tool, content)) {
    await emitToViewers(io, answer.channelId, 'message:edited', { channelId: answer.channelId, messageId: answer.id, content, tool })
  }
}

type Enqueued = { ok: true; state: MusicState; added: number; reply: MusicBotReply } | { ok: false; error: string }

interface PlayRequest {
  catalog: MusicDrivers['catalog']
  room: MusicPlayer
  socketId: string
  requestedBy: QueuedTrack['requestedBy']
  channelId: string
  query: string
}

async function findAndEnqueue({ catalog, room, socketId, requestedBy, channelId, query }: PlayRequest): Promise<Enqueued> {
  const found = await catalog.find(query)
  if (!found.ok) return found
  if (voiceChannelOf(socketId) !== channelId) return fail(NOT_IN_ROOM)
  const tracks = found.tracks.map((track) => queued(track, requestedBy))
  const startedNow = !room.state(channelId).nowPlaying
  const added = room.add(channelId, tracks)
  if (!added.ok) return fail(added.error)
  const reply: MusicBotReply = { action: 'play', added: added.added, startedNow, first: summary(tracks[0]) }
  return { ok: true, state: room.state(channelId), added: added.added, reply }
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

  socket(io, socket) {
    socket.on('music:play', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('music:play', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        if (!drivers || !player) return ack(fail(NOT_CONFIGURED))
        const channelId = await roomInControl(socket, payload?.channelId)
        if (!channelId) return ack(fail(NOT_IN_ROOM))
        const raw = payload.query
        if (!validQuery(raw) || !parseMusicQuery(raw)) return ack(fail(INVALID_QUERY))
        const query = raw.trim()
        const chat = await commandChat(user.accountId, payload.textChannelId)
        if (!chat.ok) return ack(chat)
        const limited = rateLimited(user.accountId)
        if (limited) return ack(fail(limited))
        const answer = await postToChat(io, user, chat.channel, `/play ${query}`, { action: 'searching', query })
        const requestedBy = { accountId: user.accountId, name: user.name }
        const result = await findAndEnqueue({ catalog: drivers.catalog, room: player, socketId: socket.id, requestedBy, channelId, query })
        if (!result.ok) {
          if (!answer) return ack(result)
          await replaceBotReply(io, answer, { action: 'failed', query, error: result.error })
          return ack({ ...result, posted: true })
        }
        if (answer) await replaceBotReply(io, answer, result.reply)
        ack({ ok: true, state: result.state, added: result.added })
      })
    })

    const control = (
      event: 'music:skip' | 'music:stop',
      act: (p: MusicPlayer, channelId: string) => boolean,
      reply: (before: MusicState, after: MusicState) => MusicBotReply
    ) => {
      socket.on(event, (raw, ack) => {
        if (typeof ack !== 'function') return
        void guard(event, async () => {
          const user = socket.data.user
          if (!user) return ack(fail('Não autenticado'))
          if (!player) return ack(fail(NOT_CONFIGURED))
          const request = controlOf(raw)
          const channelId = await roomInControl(socket, request.channelId)
          if (!channelId) return ack(fail(NOT_IN_ROOM))
          const chat = await commandChat(user.accountId, request.textChannelId)
          if (!chat.ok) return ack(chat)
          const limited = rateLimited(user.accountId)
          if (limited) return ack(fail(limited))
          const before = player.state(channelId)
          if (!act(player, channelId)) return ack(fail(NOTHING_PLAYING))
          const after = player.state(channelId)
          await postToChat(io, user, chat.channel, `/${event.slice('music:'.length)}`, reply(before, after))
          ack(ok(after))
        })
      })
    }
    control(
      'music:skip',
      (p, id) => p.skip(id),
      (before, after) => ({ action: 'skip', skipped: summary(before.nowPlaying!), next: after.nowPlaying && summary(after.nowPlaying) })
    )
    control(
      'music:stop',
      (p, id) => p.stop(id),
      () => ({ action: 'stop' })
    )

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
