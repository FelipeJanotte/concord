// Mensagens dos canais de texto e "digitando".
import type { User } from './account'
import type { Attachment } from './attachment'
import type { ToolPayload } from './tools'

export const MESSAGE_MAX_LENGTH = 2000

/** `text` = escrita por alguém; `tool` = resultado de uma ferramenta do grupo (v4, `tool` preenchido). */
export type MessageKind = 'text' | 'tool'
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
  /** pode ser vazio quando a mensagem tem anexos */
  content: string
  /** na ordem em que foram enviados */
  attachments: Attachment[]
  createdAt: number
  /** ausente = `text` (mensagens antigas e de quem ainda não conhece a v4) */
  kind?: MessageKind
  /** só em `kind: 'tool'`: o resultado tipado (o `content` traz o mesmo por extenso) */
  tool?: ToolPayload
}

/** `message:send`: texto e/ou anexos já enviados por `POST /uploads` (do próprio usuário, ainda não usados). */
export interface SendMessagePayload {
  channelId: string
  content: string
  attachmentIds?: string[]
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
  'message:send': (payload: SendMessagePayload) => void
  typing: (channelId: string) => void
}
