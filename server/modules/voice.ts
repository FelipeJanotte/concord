/**
 * Salas de voz: quem está em qual sala e repasse da sinalização WebRTC
 * (o áudio vai direto de um usuário para o outro). Skill `concord-voice`.
 */
import type { VoiceState } from '../../src/shared/types'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { findChannel } from '../repo/channels'

/** socket.id → estado de voz */
const voice = new Map<string, VoiceState>()

const voiceRoom = (channelId: string): string => `voice:${channelId}`

export const voiceStates = (): VoiceState[] => [...voice.values()]

export function emitVoice(io: AppServer): void {
  io.emit('voice:state', voiceStates())
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
        if (!socket.data.user) return ack({ ok: false, error: 'Não autenticado' })
        const channel = typeof payload?.channelId === 'string' ? await findChannel(payload.channelId, 'voice') : undefined
        if (!channel) return ack({ ok: false, error: 'Canal de voz não encontrado' })
        if (!socket.connected) return
        leaveVoice(io, socket)
        const peers = voiceStates()
          .filter((v) => v.channelId === channel.id)
          .map((v) => v.userId)
        voice.set(socket.id, {
          userId: socket.id,
          channelId: channel.id,
          muted: !!payload.muted,
          deafened: !!payload.deafened
        })
        socket.join(voiceRoom(channel.id))
        // Quem entra inicia a conexão WebRTC com cada pessoa que já está na sala.
        ack({ ok: true, peers })
        emitVoice(io)
      })
    })

    socket.on('voice:leave', () => leaveVoice(io, socket))

    socket.on('voice:update', (payload) => {
      const state = voice.get(socket.id)
      if (!state) return
      state.muted = !!payload?.muted
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
