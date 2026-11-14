/**
 * Salas de voz: quem está em qual sala e repasse da sinalização WebRTC
 * (o áudio vai direto de um usuário para o outro). Skill `concord-voice`.
 */
import { can, channelPermissions, type AccessState, type VoiceState } from '../../src/shared/types'
import { accessSnapshot, allowed, currentAccess } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { findChannel } from '../repo/channels'

/** socket.id → estado de voz */
const voice = new Map<string, VoiceState>()

const voiceRoom = (channelId: string): string => `voice:${channelId}`

export const voiceStates = (): VoiceState[] => [...voice.values()]

/** Estado de voz que a conta pode ver (quem está em sala privada não aparece para quem não vê a sala). */
export function voiceStatesFor(accountId: string): VoiceState[] {
  const access = accessSnapshot()
  return voiceStates().filter((v) => can(access, accountId, 'view', v.channelId))
}

/** `voice:state` (sempre a lista completa que cada conexão pode ver). */
export function emitVoice(io: AppServer): void {
  for (const socket of io.sockets.sockets.values()) {
    const user = socket.data.user
    if (user) socket.emit('voice:state', voiceStatesFor(user.accountId))
  }
}

/**
 * Ponto único chamado depois de qualquer mudança de cargos/membros/regras (A4):
 * quem perdeu `view`/`connect` na sala sai; no fim, cada um recebe o `voice:state`
 * das salas que pode ver. Com o LiveKit (B1), quem perdeu `speak`/`share` deve ter
 * as permissões atualizadas aqui (`RoomService.updateParticipant`).
 */
export function applyVoiceAccess(io: AppServer, access: AccessState): void {
  for (const state of voiceStates()) {
    const socket = io.sockets.sockets.get(state.userId)
    const accountId = socket?.data.user?.accountId
    if (socket && accountId && !can(access, accountId, 'connect', state.channelId)) leaveVoice(io, socket)
  }
  emitVoice(io)
}

function leaveVoice(io: AppServer, socket: AppSocket): void {
  const state = voice.get(socket.id)
  if (!state) return
  voice.delete(socket.id)
  socket.leave(voiceRoom(state.channelId))
  io.to(voiceRoom(state.channelId)).emit('voice:peer-left', socket.id)
  emitVoice(io)
}

/** Tira todo mundo de uma sala (usado quando o canal é apagado). Não emite `voice:state`. */
export function clearVoiceChannel(io: AppServer, channelId: string): void {
  for (const [sid, state] of voice) {
    if (state.channelId !== channelId) continue
    voice.delete(sid)
    io.sockets.sockets.get(sid)?.leave(voiceRoom(channelId))
  }
}

export const voiceModule: ServerModule = {
  socket(io, socket) {
    socket.on('voice:join', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('voice:join', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        const channel = typeof payload?.channelId === 'string' ? await findChannel(payload.channelId, 'voice') : undefined
        // Sem permissão de ver, responde como se o canal não existisse (não revela salas privadas).
        if (!channel || !(await allowed(user.accountId, 'view', channel.id))) {
          return ack({ ok: false, error: 'Canal de voz não encontrado' })
        }
        if (!(await allowed(user.accountId, 'connect', channel.id))) {
          return ack({ ok: false, error: 'Você não tem permissão para entrar nesta sala' })
        }
        // Sem `speak`, o app entra só para ouvir (e os outros veem silenciado); sem `share`, sem tela.
        const perms = channelPermissions(await currentAccess(), user.accountId, channel.id)
        const canSpeak = perms.has('speak')
        if (!socket.connected) return
        leaveVoice(io, socket)
        const peers = voiceStates()
          .filter((v) => v.channelId === channel.id)
          .map((v) => v.userId)
        voice.set(socket.id, {
          userId: socket.id,
          channelId: channel.id,
          muted: !!payload.muted || !canSpeak,
          deafened: !!payload.deafened
        })
        socket.join(voiceRoom(channel.id))
        // Quem entra inicia a conexão WebRTC com cada pessoa que já está na sala.
        ack({ ok: true, peers, canSpeak, canShare: perms.has('share') })
        emitVoice(io)
      })
    })

    socket.on('voice:leave', () => leaveVoice(io, socket))

    socket.on('voice:update', (payload) => {
      const state = voice.get(socket.id)
      const accountId = socket.data.user?.accountId
      if (!state || !accountId) return
      // quem não pode falar continua aparecendo silenciado
      state.muted = !!payload?.muted || !can(accessSnapshot(), accountId, 'speak', state.channelId)
      state.deafened = !!payload?.deafened
      emitVoice(io)
    })

    socket.on('voice:signal', (payload) => {
      if (!payload || typeof payload.to !== 'string') return
      const me = voice.get(socket.id)
      const other = voice.get(payload.to)
      // Só repassa sinalização entre pessoas na mesma sala de voz.
      if (!me || !other || me.channelId !== other.channelId) return
      io.to(payload.to).emit('voice:signal', { from: socket.id, data: payload.data })
    })

    socket.on('disconnect', () => leaveVoice(io, socket))
  }
}
