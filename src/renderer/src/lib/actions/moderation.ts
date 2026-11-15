// Moderação (B6): expulsar da voz, mover para outra sala, silenciar pelo servidor e apagar mensagem.
import type { OkResult } from '@shared/types'
import { get, notify, requireSocket, set, type AppSocket } from '../core'
import { voice } from '../voice'
import { joinVoice, OUT_OF_VOICE } from './voice'
import { leftVoiceRoom } from './voice-sounds'

export function bindModerationEvents(s: AppSocket): void {
  // mensagem apagada (pelo autor ou por quem gerencia mensagens)
  s.on('message:deleted', ({ channelId, messageId }) => {
    set((st) => {
      const list = st.messages[channelId]
      if (!list?.some((m) => m.id === messageId)) return {}
      return { messages: { ...st.messages, [channelId]: list.filter((m) => m.id !== messageId) } }
    })
  })

  // um moderador me tirou da sala: sai já, antes do voice:state, e diz quem foi
  s.on('moderation:kicked', ({ channelId, by }) => {
    if (get().myVoiceChannelId !== channelId) return
    voice.teardown()
    set({ ...OUT_OF_VOICE })
    leftVoiceRoom()
    notify(`${by} tirou você da sala de voz.`, 'info')
  })

  // um moderador me levou para outra sala: troca pela entrada de sempre (o servidor confere de novo).
  // A tela só acompanha se eu estava olhando a sala antiga; no chat de texto, fico onde estava.
  s.on('moderation:moved', ({ channelId, by }) => {
    const { myVoiceChannelId, view, channels } = get()
    if (!myVoiceChannelId || myVoiceChannelId === channelId) return
    const name = channels.find((c) => c.id === channelId)?.name ?? 'outra sala'
    notify(`${by} levou você para ${name}.`, 'info')
    const watching = view?.kind === 'voice' && view.channelId === myVoiceChannelId
    void joinVoice(channelId, { show: watching })
  })
}

function unwrap(res: OkResult): void {
  if (!res.ok) throw new Error(res.error)
}

/** Tira a conexão `userId` (o `VoiceState.userId`) da sala de voz. */
export async function kickFromVoice(userId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('moderation:voice-kick', { userId }))
}

/** Leva a conexão `userId` (o `VoiceState.userId`) para a sala de voz `channelId`. */
export async function moveToVoice(userId: string, channelId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('moderation:voice-move', { userId, channelId }))
}

/** Silencia (ou tira o silêncio) da conta para todos, nas salas de voz. */
export async function setServerMuted(accountId: string, muted: boolean): Promise<void> {
  unwrap(await requireSocket().emitWithAck('moderation:voice-mute', { accountId, muted }))
}

/** Apaga a mensagem (a própria, ou de outra pessoa com "Gerenciar mensagens"). */
export async function deleteMessage(messageId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('message:delete', { messageId }))
}
