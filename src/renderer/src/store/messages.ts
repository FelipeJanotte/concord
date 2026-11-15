// Histórico de mensagens e "digitando".
import type { Message, ReplyPreview } from '@shared/types'

export interface TypingEntry {
  name: string
  until: number
}

export interface MessagesState {
  /** Histórico carregado por canal (undefined = ainda não carregado) */
  messages: Record<string, Message[]>
  /** existem mensagens mais antigas no servidor do que as carregadas */
  hasMoreHistory: Record<string, boolean>
  /** carregando uma página mais antiga (spinner no topo do chat) */
  loadingOlder: Record<string, boolean>
  typing: Record<string, Record<string, TypingEntry>>
  /** respondendo a esta mensagem no campo de cada canal (B18) */
  replyingTo: Record<string, ReplyPreview>
  /** mensagem sendo editada no lugar (A15); só uma por vez */
  editingMessageId: string | null
}

export const messagesInitial: MessagesState = {
  messages: {},
  hasMoreHistory: {},
  loadingOlder: {},
  typing: {},
  replyingTo: {},
  editingMessageId: null
}
