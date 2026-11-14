// Mensagens dos canais de texto e "digitando".
import type { User } from './account'

export const MESSAGE_MAX_LENGTH = 2000
/** Quantas mensagens vêm por página do histórico. */
export const HISTORY_PAGE_SIZE = 50

export interface Message {
  id: string
  channelId: string
  /**
   * Autor. Em `message:new`, `author.id` é o socket.id de quem enviou; no histórico
   * é o id da conta. Para saber quem é a pessoa, use sempre `author.accountId`.
   */
  author: User
  content: string
  createdAt: number
}

/** `message:history`: sem `before` = página mais recente; com `before` = as anteriores àquela mensagem. */
export interface HistoryRequest {
  channelId: string
  before?: string
}

/** Página do histórico (da mais antiga para a mais nova) e se existem mensagens mais antigas. */
export interface HistoryPage {
  messages: Message[]
  hasMore: boolean
}

// ---------- Eventos ----------

export interface MessageServerEvents {
  'message:new': (message: Message) => void
  typing: (payload: { channelId: string; userId: string; name: string }) => void
}

export interface MessageClientEvents {
  'message:history': (req: HistoryRequest, ack: (page: HistoryPage) => void) => void
  'message:send': (payload: { channelId: string; content: string }) => void
  typing: (channelId: string) => void
}
