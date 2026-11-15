// Reações em mensagens (A16): liga/tira a minha reação e aplica a lista que o servidor manda.
import { cleanReactionEmoji, type Message, type Reaction } from '@shared/types'
import { get, requireSocket, set, type AppSocket } from '../core'

function applyReactions(channelId: string, messageId: string, reactions: Reaction[]): void {
  set((st) => {
    const list = st.messages[channelId]
    if (!list?.some((m) => m.id === messageId)) return {}
    return {
      messages: {
        ...st.messages,
        [channelId]: list.map((m) => {
          if (m.id !== messageId) return m
          if (reactions.length > 0) return { ...m, reactions }
          const { reactions: _gone, ...rest } = m
          return rest
        })
      }
    }
  })
}

export function bindReactionsEvents(s: AppSocket): void {
  s.on('message:reactions', ({ channelId, messageId, reactions }) => applyReactions(channelId, messageId, reactions))
}

/** Eu já reagi com esse emoji? */
export function hasReacted(message: Message, emoji: string, accountId: string | undefined): boolean {
  return !!accountId && !!message.reactions?.some((r) => r.emoji === emoji && r.accountIds.includes(accountId))
}

/** Liga ou tira a minha reação (o contrário do que está). Lança `Error` com a mensagem do servidor. */
export async function toggleReaction(message: Message, emoji: string): Promise<void> {
  const clean = cleanReactionEmoji(emoji)
  if (!clean) throw new Error('Reação inválida')
  const on = !hasReacted(message, clean, get().self?.accountId)
  const res = await requireSocket().emitWithAck('message:react', { messageId: message.id, emoji: clean, on })
  if (!res.ok) throw new Error(res.error)
}

/** Abre (ou fecha) o seletor de emoji de uma mensagem; só um aberto por vez. */
export function openReactionPicker(messageId: string | null): void {
  set({ reactionPickerFor: messageId })
}
