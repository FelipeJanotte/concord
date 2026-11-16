// Mensagens dos canais de texto e "digitando".
import type { User } from './account'
import type { Attachment } from './attachment'
import type { Mention } from './mentions'
import type { OkResult } from './permissions'
import type { Reaction } from './reactions'
import type { ToolPayload } from './tools'

export const MESSAGE_MAX_LENGTH = 2000

/** `text` = escrita por alguém; `tool` = resultado de uma ferramenta do grupo (v4, `tool` preenchido). */
export type MessageKind = 'text' | 'tool'
/** Quantas mensagens vêm por página do histórico. */
export const HISTORY_PAGE_SIZE = 50
/** Tamanho do trecho da mensagem respondida que aparece na citação (B18). */
export const REPLY_PREVIEW_MAX = 100

/**
 * Resumo da mensagem que esta responde (B18). Vem pronto do servidor (no envio e no histórico),
 * para a citação aparecer mesmo quando a original não está carregada na tela.
 */
/** Começo do texto para a citação (espaços juntos, até `REPLY_PREVIEW_MAX`); igual no servidor e na tela. */
export function replyPreviewText(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim()
  return text.length > REPLY_PREVIEW_MAX ? text.slice(0, REPLY_PREVIEW_MAX - 1) + '…' : text
}

export interface ReplyPreview {
  /** id da mensagem original (para rolar até ela) */
  id: string
  authorName: string
  /** conta do autor da original (null se a conta não existe mais) */
  authorAccountId: string | null
  /** começo do texto (até `REPLY_PREVIEW_MAX`); vazio quando a original só tem anexos */
  content: string
  /** a original foi apagada (a citação vira "mensagem apagada") */
  deleted?: boolean
}

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
  /** quando foi editada pela última vez (A15); ausente = nunca editada */
  editedAt?: number
  /** a mensagem que esta responde (B18); ausente = não é resposta */
  replyTo?: ReplyPreview
  /** reações (A16), na ordem em que cada emoji apareceu; ausente = nenhuma */
  reactions?: Reaction[]
  /** contas mencionadas no texto com o nome atual (B19); ausente = nenhuma (o @todos está no próprio texto) */
  mentions?: Mention[]
}

/** `message:send`: texto e/ou anexos já enviados por `POST /uploads` (do próprio usuário, ainda não usados). */
export interface SendMessagePayload {
  channelId: string
  content: string
  attachmentIds?: string[]
  /** responder a esta mensagem (B18): do mesmo canal; inválida = enviada sem a citação */
  replyToId?: string
}

/** `message:edit` (A15): só o autor, só mensagens de texto; mesmas regras de tamanho do envio. */
export interface EditMessagePayload {
  messageId: string
  content: string
}

/** `message:edited`: o texto novo de uma mensagem (para quem vê o canal). */
export interface MessageEdited {
  channelId: string
  messageId: string
  content: string
  editedAt: number
  /** as menções do texto novo (B19) */
  mentions?: Mention[]
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
  /** uma mensagem foi editada (A15; para quem vê o canal) */
  'message:edited': (payload: MessageEdited) => void
  typing: (payload: { channelId: string; userId: string; name: string }) => void
}

export interface MessageClientEvents {
  'message:history': (req: HistoryRequest, ack: (page: HistoryPage) => void) => void
  'message:send': (payload: SendMessagePayload, ack?: (res: OkResult) => void) => void
  /** edita a própria mensagem (A15) */
  'message:edit': (payload: EditMessagePayload, ack: (res: OkResult) => void) => void
  typing: (channelId: string) => void
}
