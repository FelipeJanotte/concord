/**
 * Mensagens dos canais de texto.
 *
 * O autor é guardado pela conta (`author_id`) e juntado na leitura, então o
 * histórico mostra nome/foto atuais. A cópia `author_*` só aparece quando a
 * conta não existe mais (ou em mensagens importadas de antes das contas).
 */
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm'
import { HISTORY_PAGE_SIZE, parseMentions, replyPreviewText, type Attachment, type Mention, type Message, type ReplyPreview, type ToolPayload } from '../../src/shared/types'
import { db } from '../db/client'
import { accounts, attachments, messages } from '../db/schema'
import { accountNames, avatarUrl } from './accounts'
import { attachmentsByMessage, toAttachment } from './attachments'
import { reactionsByMessage } from './reactions'
import { isUuid } from './util'

export interface HistoryOptions {
  /** id da mensagem mais antiga que o cliente já tem; devolve só as anteriores a ela */
  before?: string
  limit?: number
}

/** Uma página do histórico, da mais antiga para a mais nova, e se existem mais antigas. */
export async function listMessages(
  channelId: string,
  { before, limit = HISTORY_PAGE_SIZE }: HistoryOptions = {}
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const empty = { messages: [], hasMore: false }
  if (!isUuid(channelId)) return empty
  const size = Math.min(Math.max(Math.trunc(limit) || HISTORY_PAGE_SIZE, 1), 100)

  let cursor: number | undefined
  if (before !== undefined) {
    if (!isUuid(before)) return empty
    const [ref] = await db()
      .select({ seq: messages.seq })
      .from(messages)
      .where(and(eq(messages.id, before), eq(messages.channelId, channelId)))
      .limit(1)
    if (!ref) return empty
    cursor = ref.seq
  }

  const rows = await db()
    .select({ m: messages, a: accounts })
    .from(messages)
    .leftJoin(accounts, eq(accounts.id, messages.authorId))
    .where(cursor === undefined ? eq(messages.channelId, channelId) : and(eq(messages.channelId, channelId), lt(messages.seq, cursor)))
    .orderBy(desc(messages.seq))
    .limit(size + 1)

  const hasMore = rows.length > size
  const page = rows.slice(0, size).reverse()
  const files = await attachmentsByMessage(page.map(({ m }) => m.id))
  const reactions = await reactionsByMessage(page.map(({ m }) => m.id))
  const names = await accountNames(page.flatMap(({ m }) => parseMentions(m.content).accountIds))
  const replies = await replyPreviews(page.map(({ m }) => m.replyToId).filter((id): id is string => !!id))
  return {
    hasMore,
    messages: page.map(({ m, a }) => ({
      id: m.id,
      channelId: m.channelId,
      content: m.content,
      attachments: files.get(m.id) ?? [],
      ...(m.kind === 'tool' && m.tool ? { kind: 'tool' as const, tool: m.tool } : {}),
      createdAt: m.createdAt.getTime(),
      ...(m.editedAt ? { editedAt: m.editedAt.getTime() } : {}),
      ...(reactions.get(m.id) ? { reactions: reactions.get(m.id) } : {}),
      ...withMentions(m.content, names),
      ...(m.replyToId ? { replyTo: replies.get(m.replyToId) ?? deletedReply(m.replyToId) } : {}),
      author: a
        ? { id: a.id, accountId: a.id, name: a.name, tag: a.tag, color: a.color, avatarUrl: avatarUrl(a) }
        : {
            id: m.authorId ?? `removido-${m.id}`,
            accountId: m.authorId ?? '',
            name: m.authorName,
            tag: m.authorTag,
            color: m.authorColor,
            avatarUrl: null
          }
    }))
  }
}

class InvalidAttachments extends Error {}

/**
 * Grava a mensagem e prende a ela os anexos `attachmentIds` (na ordem dada).
 * Cada anexo precisa ser do autor e ainda não estar em outra mensagem; se algum
 * não servir, nada é gravado e devolve null. Devolve a mensagem com os anexos.
 * `author.accountId` vira `author_id` (null se não for uma conta).
 */
export async function insertMessage(message: Message, attachmentIds: string[] = []): Promise<Message | null> {
  const authorId = isUuid(message.author.accountId) ? message.author.accountId : null
  if (attachmentIds.length > 0 && (!authorId || !attachmentIds.every(isUuid))) return null
  try {
    return await db().transaction(async (tx) => {
      await tx.insert(messages).values({
        id: message.id,
        channelId: message.channelId,
        authorId,
        authorName: message.author.name,
        authorTag: message.author.tag,
        authorColor: message.author.color,
        content: message.content,
        kind: message.kind ?? 'text',
        tool: message.kind === 'tool' ? (message.tool ?? null) : null,
        createdAt: new Date(message.createdAt),
        replyToId: message.replyTo?.id ?? null
      })
      const files: Attachment[] = []
      for (const [position, id] of attachmentIds.entries()) {
        const [row] = await tx
          .update(attachments)
          .set({ messageId: message.id, position })
          .where(and(eq(attachments.id, id), eq(attachments.uploaderId, authorId!), isNull(attachments.messageId)))
          .returning()
        if (!row) throw new InvalidAttachments()
        files.push(toAttachment(row))
      }
      return { ...message, attachments: files }
    })
  } catch (err) {
    if (err instanceof InvalidAttachments) return null
    throw err
  }
}

/** `{ mentions }` com as contas do texto que existem (nada se não menciona ninguém). */
function withMentions(content: string, names: Map<string, string>): { mentions?: Mention[] } {
  const mentions = parseMentions(content)
    .accountIds.filter((id) => names.has(id))
    .map((id) => ({ accountId: id, name: names.get(id)! }))
  return mentions.length > 0 ? { mentions } : {}
}

/** As menções de um texto com o nome atual de cada conta (B19); contas inexistentes ficam de fora. */
export async function resolveMentions(content: string): Promise<{ mentions?: Mention[] }> {
  return withMentions(content, await accountNames(parseMentions(content).accountIds))
}

const deletedReply = (id: string): ReplyPreview => ({ id, authorName: '', authorAccountId: null, content: '', deleted: true })

/** Resumos das mensagens respondidas (B18), por id. Quem não aparece no mapa foi apagado. */
export async function replyPreviews(ids: string[]): Promise<Map<string, ReplyPreview>> {
  const out = new Map<string, ReplyPreview>()
  const valid = [...new Set(ids)].filter(isUuid)
  if (valid.length === 0) return out
  const rows = await db()
    .select({ id: messages.id, content: messages.content, authorId: messages.authorId, authorName: messages.authorName, name: accounts.name })
    .from(messages)
    .leftJoin(accounts, eq(accounts.id, messages.authorId))
    .where(inArray(messages.id, valid))
  for (const r of rows) {
    out.set(r.id, { id: r.id, authorName: r.name ?? r.authorName, authorAccountId: r.authorId, content: replyPreviewText(r.content) })
  }
  return out
}

/** Resumo de uma mensagem para responder a ela (B18): só se existe e é do canal `channelId`. */
export async function findReplyTarget(id: string, channelId: string): Promise<ReplyPreview | undefined> {
  if (!isUuid(id) || !isUuid(channelId)) return undefined
  const [row] = await db().select({ channelId: messages.channelId }).from(messages).where(eq(messages.id, id)).limit(1)
  if (!row || row.channelId !== channelId) return undefined
  return (await replyPreviews([id])).get(id)
}

/** O que o `message:edit` precisa saber da mensagem (A15). Id inválido = não existe. */
export async function findEditable(
  id: string
): Promise<{ channelId: string; authorId: string | null; kind: string; content: string; attachments: number } | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await db()
    .select({ channelId: messages.channelId, authorId: messages.authorId, kind: messages.kind, content: messages.content })
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1)
  if (!row) return undefined
  const files = await db().select({ id: attachments.id }).from(attachments).where(eq(attachments.messageId, id))
  return { ...row, attachments: files.length }
}

/** Troca o texto da mensagem do autor (só `kind = 'text'`) e marca a edição. Devolve quando, ou null se não mudou nada. */
export async function editMessage(id: string, authorId: string, content: string): Promise<number | null> {
  if (!isUuid(id) || !isUuid(authorId)) return null
  const editedAt = new Date()
  const [row] = await db()
    .update(messages)
    .set({ content, editedAt })
    .where(and(eq(messages.id, id), eq(messages.authorId, authorId), eq(messages.kind, 'text')))
    .returning({ id: messages.id })
  return row ? editedAt.getTime() : null
}

export async function updateToolMessage(id: string, tool: ToolPayload, content: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const rows = await db()
    .update(messages)
    .set({ tool, content })
    .where(and(eq(messages.id, id), eq(messages.kind, 'tool')))
    .returning({ id: messages.id })
  return rows.length > 0
}

/** Canal e autor (conta) de uma mensagem, para conferir quem pode apagar. Id inválido = não existe. */
export async function findMessageMeta(id: string): Promise<{ channelId: string; authorId: string | null } | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await db()
    .select({ channelId: messages.channelId, authorId: messages.authorId })
    .from(messages)
    .where(eq(messages.id, id))
  return row
}

/** Canal e resultado de uma mensagem de ferramenta (`kind: 'tool'`). Id inválido ou mensagem comum = undefined. */
export async function findToolMessage(id: string): Promise<{ channelId: string; tool: ToolPayload } | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await db()
    .select({ channelId: messages.channelId, tool: messages.tool })
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.kind, 'tool')))
  return row?.tool ? { channelId: row.channelId, tool: row.tool } : undefined
}

/**
 * Apaga a mensagem (os registros dos anexos saem junto, por cascade).
 * Devolve os ids dos anexos para o chamador apagar os arquivos, ou null se ela não existia.
 */
export async function deleteMessage(id: string): Promise<string[] | null> {
  if (!isUuid(id)) return null
  return db().transaction(async (tx) => {
    const files = await tx.select({ id: attachments.id }).from(attachments).where(eq(attachments.messageId, id))
    const gone = await tx.delete(messages).where(eq(messages.id, id)).returning({ id: messages.id })
    return gone.length === 0 ? null : files.map((f) => f.id)
  })
}
