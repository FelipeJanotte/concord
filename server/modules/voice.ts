/**
 * Salas de voz: valida a entrada, emite o token do LiveKit (o áudio e a tela passam
 * pelo LiveKit, não por aqui) e mantém a lista de quem está em cada sala. Skill `concord-voice`.
 */
import type { VoiceState } from '../../src/shared/types'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { closeRoom, createVoiceCredentials, kickFromRoom, liveKitConfig } from '../livekit'
import { findChannel } from '../repo/channels'

/** socket.id → estado de voz */
const voice = new Map<string, VoiceState>()

export const voiceStates = (): VoiceState[] => [...voice.values()]

export function emitVoice(io: AppServer): void {
  io.emit('voice:state', voiceStates())
}

function leaveVoice(io: AppServer, socket: AppSocket): void {
  const state = voice.get(socket.id)
  if (!state) return
  voice.delete(socket.id)
  if (liveKitConfig) void kickFromRoom(liveKitConfig, state.channelId, socket.id)
  emitVoice(io)
}

/** Tira todo mundo de uma sala (usado quando o canal é apagado). Não emite `voice:state`. */
export function clearVoiceChannel(_io: AppServer, channelId: string): void {
  let hadPeople = false
  for (const [sid, state] of voice) {
    if (state.channelId !== channelId) continue
    voice.delete(sid)
    hadPeople = true
  }
  if (hadPeople && liveKitConfig) void closeRoom(liveKitConfig, channelId)
}

export const voiceModule: ServerModule = {
  socket(io, socket) {
    socket.on('voice:join', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('voice:join', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        if (!liveKitConfig) return ack({ ok: false, error: 'A voz não está configurada neste servidor' })
        const channel = typeof payload?.channelId === 'string' ? await findChannel(payload.channelId, 'voice') : undefined
        if (!channel) return ack({ ok: false, error: 'Canal de voz não encontrado' })
        const credentials = await createVoiceCredentials(liveKitConfig, user, channel.id)
        if (!socket.connected) return
        // Trocar de sala: sai da anterior (inclusive no LiveKit) antes de entrar na nova.
        if (voice.get(socket.id)?.channelId !== channel.id) leaveVoice(io, socket)
        voice.set(socket.id, {
          userId: socket.id,
          channelId: channel.id,
          muted: !!payload.muted,
          deafened: !!payload.deafened
        })
        ack({ ok: true, ...credentials })
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

    socket.on('disconnect', () => leaveVoice(io, socket))
  }
}
