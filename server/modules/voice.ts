import {
  can,
  channelPermissions,
  MAX_WATCHED_SCREENS,
  SCREEN_PREVIEW_MAX_CHARS,
  SCREEN_PREVIEW_PREFIX,
  type AccessState,
  type ScreenPreviewResult,
  type VoicePermissions,
  type VoiceState
} from '../../src/shared/types'
import { accessSnapshot, allowed, currentAccess, dmMembersOf } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import {
  closeRoom,
  createScreenCredentials,
  createVoiceCredentials,
  kickFromRoom,
  liveKitConfig,
  screenIdentityOf,
  updateVoicePermissions
} from '../livekit'
import { limiters, retryText } from '../middleware/rate-limit'
import { findChannel } from '../repo/channels'
import { listServerMutes, setServerMute } from '../repo/moderation'
import { isTimedOut, onTimeoutsChange } from './timeouts'

const voice = new Map<string, VoiceState>()
const published = new Map<string, VoicePermissions>()
const selfMuted = new Map<string, boolean>()
const serverMuted = new Set<string>()
const screenPreviews = new Map<string, string>()
const watchRequests = new Map<string, string[]>()

const PREVIEW_UNAVAILABLE: ScreenPreviewResult = { ok: false, error: 'Prévia indisponível' }

function isScreenPreview(image: unknown): image is string {
  return typeof image === 'string' && image.startsWith(SCREEN_PREVIEW_PREFIX) && image.length <= SCREEN_PREVIEW_MAX_CHARS
}

async function canPreview(accountId: string, channelId: string): Promise<boolean> {
  return (await allowed(accountId, 'view', channelId)) && (await allowed(accountId, 'connect', channelId))
}

export const voiceStates = (): VoiceState[] => [...voice.values()]

function isScreenList(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.length <= MAX_WATCHED_SCREENS && ids.every((id) => typeof id === 'string')
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => b[i] === id)
}

function inSameRoom(viewer: VoiceState, screenId: string): boolean {
  return screenId !== viewer.userId && voice.get(screenId)?.channelId === viewer.channelId
}

function watchedScreens(viewer: VoiceState): string[] {
  return (watchRequests.get(viewer.userId) ?? []).filter((id) => voice.get(id)?.sharing)
}

function forgetScreen(screenId: string): void {
  for (const [viewerId, ids] of watchRequests) {
    if (ids.includes(screenId)) watchRequests.set(viewerId, ids.filter((id) => id !== screenId))
  }
}

function forgetConnection(socketId: string): void {
  watchRequests.delete(socketId)
  forgetScreen(socketId)
}

function voicePermissions(access: AccessState, accountId: string, channelId: string): VoicePermissions {
  const perms = channelPermissions(access, accountId, channelId)
  return { canSpeak: perms.has('speak') && !isServerMuted(accountId), canShare: perms.has('share'), canVideo: perms.has('video') }
}

async function voicePermissionsIn(accountId: string, channelId: string): Promise<VoicePermissions> {
  if (!dmMembersOf(channelId)) return voicePermissions(await currentAccess(), accountId, channelId)
  return { canSpeak: await allowed(accountId, 'speak', channelId), canShare: await allowed(accountId, 'share', channelId), canVideo: await allowed(accountId, 'video', channelId) }
}

function seesRoom(access: AccessState, accountId: string, channelId: string): boolean {
  const dm = dmMembersOf(channelId)
  return dm ? dm.includes(accountId) : can(access, accountId, 'view', channelId)
}

export function voiceChannelOf(socketId: string): string | undefined {
  return voice.get(socketId)?.channelId
}

export function voiceSocketsIn(channelId: string): string[] {
  return voiceStates()
    .filter((v) => v.channelId === channelId)
    .map((v) => v.userId)
}

export function voiceStatesFor(accountId: string, socketId?: string): VoiceState[] {
  const access = accessSnapshot()
  const room = socketId ? voiceChannelOf(socketId) : undefined
  return voiceStates()
    .filter((v) => seesRoom(access, accountId, v.channelId))
    .map((v) => (room && v.channelId === room ? { ...v, watching: watchedScreens(v) } : v))
}

const roomListeners = new Set<(io: AppServer) => void>()

export function onVoiceRoomsChange(fn: (io: AppServer) => void): void {
  roomListeners.add(fn)
}

export function emitVoice(io: AppServer): void {
  for (const socket of io.sockets.sockets.values()) {
    const user = socket.data.user
    if (user) socket.emit('voice:state', voiceStatesFor(user.accountId, socket.id))
  }
  for (const fn of roomListeners) fn(io)
}

export function applyVoiceAccess(io: AppServer, access: AccessState): void {
  for (const state of voiceStates()) {
    const socket = io.sockets.sockets.get(state.userId)
    const accountId = socket?.data.user?.accountId
    if (!socket || !accountId) continue
    if (dmMembersOf(state.channelId)) continue
    if (!can(access, accountId, 'connect', state.channelId)) {
      leaveVoice(io, socket, { emit: false })
      continue
    }
    state.serverMuted = isServerMuted(accountId)
    const next = voicePermissions(access, accountId, state.channelId)
    const before = published.get(socket.id)
    if (before && before.canSpeak === next.canSpeak && before.canShare === next.canShare && before.canVideo === next.canVideo) continue
    published.set(socket.id, next)
    state.muted = !next.canSpeak || (selfMuted.get(socket.id) ?? state.muted)
    if (!next.canShare) {
      state.sharing = false
      screenPreviews.delete(socket.id)
      forgetScreen(socket.id)
      endScreenShare(accountId, state.channelId)
    }
    if (liveKitConfig) void updateVoicePermissions(liveKitConfig, state.channelId, socket.id, next)
  }
  emitVoice(io)
}

function leaveVoice(io: AppServer, socket: AppSocket, { emit = true } = {}): void {
  const state = voice.get(socket.id)
  if (!state) return
  voice.delete(socket.id)
  published.delete(socket.id)
  selfMuted.delete(socket.id)
  screenPreviews.delete(socket.id)
  forgetConnection(socket.id)
  if (liveKitConfig) void kickFromRoom(liveKitConfig, state.channelId, socket.id)
  const accountId = socket.data.user?.accountId
  if (accountId && !accountStillInRoom(io, accountId, state.channelId)) endScreenShare(accountId, state.channelId)
  if (emit) emitVoice(io)
}

function accountStillInRoom(io: AppServer, accountId: string, channelId: string): boolean {
  return voiceStates().some((state) => state.channelId === channelId && io.sockets.sockets.get(state.userId)?.data.user?.accountId === accountId)
}

function endScreenShare(accountId: string, channelId: string): void {
  if (liveKitConfig) void kickFromRoom(liveKitConfig, channelId, screenIdentityOf(accountId))
}

export function isServerMuted(accountId: string): boolean {
  return serverMuted.has(accountId) || isTimedOut(accountId)
}

export function kickFromVoice(io: AppServer, socketId: string): VoiceState | undefined {
  const socket = io.sockets.sockets.get(socketId)
  const state = voice.get(socketId)
  if (!socket || !state) return undefined
  leaveVoice(io, socket)
  return state
}

export async function setServerMuted(io: AppServer, accountId: string, muted: boolean, mutedBy: string | null = null): Promise<void> {
  await setServerMute(accountId, muted, mutedBy)
  if (muted) serverMuted.add(accountId)
  else serverMuted.delete(accountId)
  applyVoiceAccess(io, accessSnapshot())
}

export function leaveDmVoice(io: AppServer, dmChannelId: string): void {
  let changed = false
  for (const state of voiceStates()) {
    if (state.channelId !== dmChannelId) continue
    const socket = io.sockets.sockets.get(state.userId)
    if (socket) {
      leaveVoice(io, socket, { emit: false })
      changed = true
    }
  }
  if (changed) emitVoice(io)
}

export function clearVoiceChannel(_io: AppServer, channelId: string): void {
  for (const [sid, state] of voice) {
    if (state.channelId !== channelId) continue
    voice.delete(sid)
    published.delete(sid)
    selfMuted.delete(sid)
    screenPreviews.delete(sid)
    forgetConnection(sid)
  }
  if (liveKitConfig) void closeRoom(liveKitConfig, channelId)
}

export const voiceModule: ServerModule = {
  async init() {
    serverMuted.clear()
    for (const accountId of await listServerMutes()) serverMuted.add(accountId)
    onTimeoutsChange((io) => applyVoiceAccess(io, accessSnapshot()))
  },

  socket(io, socket) {
    socket.on('voice:join', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('voice:join', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        if (!liveKitConfig) return ack({ ok: false, error: 'A voz não está configurada neste servidor' })
        const found = typeof payload?.channelId === 'string' ? await findChannel(payload.channelId) : undefined
        const channel = found && (found.type === 'voice' || found.type === 'dm') ? found : undefined
        if (!channel || !(await allowed(user.accountId, 'view', channel.id))) {
          return ack({ ok: false, error: 'Canal de voz não encontrado' })
        }
        if (!(await allowed(user.accountId, 'connect', channel.id))) {
          const error = channel.type === 'dm' ? 'Não foi possível entrar na chamada' : 'Você não tem permissão para entrar nesta sala'
          return ack({ ok: false, error })
        }
        const permissions = await voicePermissionsIn(user.accountId, channel.id)
        const credentials = await createVoiceCredentials(liveKitConfig, user, channel.id, permissions)
        if (!socket.connected) return
        if (voice.get(socket.id)?.channelId !== channel.id) leaveVoice(io, socket)
        voice.set(socket.id, {
          userId: socket.id,
          channelId: channel.id,
          muted: !!payload.muted || !permissions.canSpeak,
          serverMuted: isServerMuted(user.accountId),
          deafened: !!payload.deafened,
          sharing: false
        })
        published.set(socket.id, permissions)
        selfMuted.set(socket.id, !!payload.muted)
        screenPreviews.delete(socket.id)
        forgetConnection(socket.id)
        ack({ ok: true, ...credentials, ...permissions })
        emitVoice(io)
      })
    })

    socket.on('voice:leave', () => leaveVoice(io, socket))

    socket.on('voice:update', (payload) => {
      const state = voice.get(socket.id)
      if (!state) return
      const canSpeak = published.get(socket.id)?.canSpeak !== false
      if (canSpeak) selfMuted.set(socket.id, !!payload?.muted)
      state.muted = !!payload?.muted || !canSpeak
      state.deafened = !!payload?.deafened
      emitVoice(io)
    })

    socket.on('voice:sharing', (sharing) => {
      const state = voice.get(socket.id)
      if (!state || typeof sharing !== 'boolean' || state.sharing === sharing) return
      if (sharing && published.get(socket.id)?.canShare === false) return
      state.sharing = sharing
      if (!sharing) {
        screenPreviews.delete(socket.id)
        forgetScreen(socket.id)
      }
      emitVoice(io)
    })

    socket.on('voice:screen-credentials', (ack) => {
      if (typeof ack !== 'function') return
      void guard('voice:screen-credentials', async () => {
        const user = socket.data.user
        const state = voice.get(socket.id)
        if (!user || !state) return ack({ ok: false, error: 'Entre numa sala de voz para compartilhar a tela' })
        if (!liveKitConfig) return ack({ ok: false, error: 'A voz não está configurada neste servidor' })
        const limited = limiters.screenCredentials.take(user.accountId)
        if (!limited.ok) return ack({ ok: false, error: `Muitos pedidos para compartilhar a tela. ${retryText(limited.retryAfterMs)}` })
        if (!(await allowed(user.accountId, 'share', state.channelId))) {
          return ack({ ok: false, error: 'Você não tem permissão para compartilhar a tela nesta sala' })
        }
        ack({ ok: true, ...(await createScreenCredentials(liveKitConfig, user, state.channelId)) })
      })
    })

    socket.on('voice:watching', (screenIds) => {
      const state = voice.get(socket.id)
      if (!state || !isScreenList(screenIds)) return
      if (!limiters.screenWatching.take(socket.id).ok) return
      const next = [...new Set(screenIds)].filter((id) => inSameRoom(state, id))
      if (sameIds(next, watchRequests.get(socket.id) ?? [])) return
      watchRequests.set(socket.id, next)
      emitVoice(io)
    })

    socket.on('voice:preview', (image) => {
      if (!voice.get(socket.id)?.sharing || !isScreenPreview(image)) return
      if (!limiters.screenPreview.take(socket.id).ok) return
      screenPreviews.set(socket.id, image)
    })

    socket.on('voice:preview-get', (userId, ack) => {
      if (typeof ack !== 'function') return
      void guard('voice:preview-get', async () => {
        const user = socket.data.user
        const state = typeof userId === 'string' ? voice.get(userId) : undefined
        if (!user || !state?.sharing || !(await canPreview(user.accountId, state.channelId))) return ack(PREVIEW_UNAVAILABLE)
        const limited = limiters.screenPreviewGet.take(user.accountId)
        if (!limited.ok) return ack({ ok: false, error: `Muitos pedidos de prévia. ${retryText(limited.retryAfterMs)}` })
        ack({ ok: true, image: screenPreviews.get(state.userId) ?? null })
      })
    })

    socket.on('disconnect', () => leaveVoice(io, socket))
  }
}
