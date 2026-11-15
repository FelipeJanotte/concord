// Moderação (B6): expulsar da voz, silenciar pelo servidor e apagar mensagem.
import type { OkResult } from '@shared/types'
import { get, notify, requireSocket, set, type AppSocket } from '../core'
import { voice } from '../voice'
import { OUT_OF_VOICE } from './voice'
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
}

function unwrap(res: OkResult): void {
  if (!res.ok) throw new Error(res.error)
}

/** Tira a conexão `userId` (o `VoiceState.userId`) da sala de voz. */
export async function kickFromVoice(userId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('moderation:voice-kick', { userId }))
}

/** Silencia (ou tira o silêncio) da conta para todos, nas salas de voz. */
export async function setServerMuted(accountId: string, muted: boolean): Promise<void> {
  unwrap(await requireSocket().emitWithAck('moderation:voice-mute', { accountId, muted }))
}

/** Apaga a mensagem (a própria, ou de outra pessoa com "Gerenciar mensagens"). */
export async function deleteMessage(messageId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('message:delete', { messageId }))
}
