/**
 * Mensagens dos canais de texto.
 *
 * O autor é guardado pela conta (`author_id`) e juntado na leitura, então o
 * histórico mostra nome/foto atuais. A cópia `author_*` só aparece quando a
 * conta não existe mais (ou em mensagens importadas de antes das contas).
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import { HISTORY_PAGE_SIZE, SEARCH_PAGE_SIZE, parseMentions, replyPreviewText, type Attachment, type LinkEmbed, type Mention, type Message, type ReplyPreview, type ToolPayload } from '../../src/shared/types'
import { db } from '../db/client'
import { accounts, attachments, messages, type StoredEmbed } from '../db/schema'
import { accountNames, avatarUrl } from './accounts'
import { attachmentsByMessage, toAttachment } from './attachments'
import { reactionsByMessage } from './reactions'
import { isUuid } from './util'

export interface HistoryOptions {
  before?: string
  after?: string
  around?: string
  limit?: number
}

export interface HistoryResult {
  messages: Message[]
  hasMore: boolean
  hasNewer?: boolean
}

type MessageRow = { m: typeof messages.$inferSelect; a: typeof accounts.$inferSelect | null }

const EMPTY_PAGE: HistoryResult = { messages: [], hasMore: false }

function selectRows() {
  return db().select({ m: messages, a: accounts }).from(messages).leftJoin(accounts, eq(accounts.id, messages.authorId))
}

async function seqOf(id: string, channelId: string): Promise<number | undefined> {
  if (!isUuid(id)) return undefined
  const [ref] = await db()
    .select({ seq: messages.seq })
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.channelId, channelId)))
    .limit(1)
  return ref?.seq
}

const olderThan = (channelId: string, seq: number, size: number) =>
  selectRows().where(and(eq(messages.channelId, channelId), lt(messages.seq, seq))).orderBy(desc(messages.seq)).limit(size + 1)

const fromSeq = (channelId: string, seq: number, size: number) =>
  selectRows().where(and(eq(messages.channelId, channelId), gte(messages.seq, seq))).orderBy(asc(messages.seq)).limit(size + 1)

export async function listMessages(channelId: string, { before, after, around, limit = HISTORY_PAGE_SIZE }: HistoryOptions = {}): Promise<HistoryResult> {
  if (!isUuid(channelId)) return EMPTY_PAGE
  const size = Math.min(Math.max(Math.trunc(limit) || HISTORY_PAGE_SIZE, 1), 100)

  if (around !== undefined) {
    const seq = await seqOf(around, channelId)
    if (seq === undefined) return EMPTY_PAGE
    const half = Math.ceil(size / 2)
    const older = await olderThan(channelId, seq, size - half)
    const newer = await fromSeq(channelId, seq, half)
    return {
      messages: await toMessages([...older.slice(0, size - half).reverse(), ...newer.slice(0, half)]),
      hasMore: older.length > size - half,
      hasNewer: newer.length > half
    }
  }

  if (after !== undefined) {
    const seq = await seqOf(after, channelId)
    if (seq === undefined) return EMPTY_PAGE
    const rows = await fromSeq(channelId, seq + 1, size)
    return { messages: await toMessages(rows.slice(0, size)), hasMore: true, hasNewer: rows.length > size }
  }

  let rows: MessageRow[]
  if (before !== undefined) {
    const seq = await seqOf(before, channelId)
    if (seq === undefined) return EMPTY_PAGE
    rows = await olderThan(channelId, seq, size)
  } else {
    rows = await selectRows().where(eq(messages.channelId, channelId)).orderBy(desc(messages.seq)).limit(size + 1)
  }
  return { messages: await toMessages(rows.slice(0, size).reverse()), hasMore: rows.length > size }
}

async function toMessages(rows: MessageRow[]): Promise<Message[]> {
  const ids = rows.map(({ m }) => m.id)
  const files = await attachmentsByMessage(ids)
  const reactions = await reactionsByMessage(ids)
  const names = await accountNames(rows.flatMap(({ m }) => parseMentions(m.content).accountIds))
  const replies = await replyPreviews(rows.map(({ m }) => m.replyToId).filter((id): id is string => !!id))
  return rows.map(({ m, a }) => ({
    id: m.id,
    channelId: m.channelId,
    content: m.content,
    attachments: files.get(m.id) ?? [],
    ...(m.kind === 'tool' && m.tool ? { kind: 'tool' as const, tool: m.tool } : {}),
    ...(m.kind === 'pin' ? { kind: 'pin' as const } : {}),
    createdAt: m.createdAt.getTime(),
    ...(m.editedAt ? { editedAt: m.editedAt.getTime() } : {}),
    ...(m.pinnedAt ? { pinnedAt: m.pinnedAt.getTime() } : {}),
    ...(m.embed ? { embed: toLinkEmbed(m.id, m.embed) } : {}),
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

export type { StoredEmbed }

export const embedImagePath = (messageId: string): string => `/embeds/${messageId}`

export function toLinkEmbed(messageId: string, stored: StoredEmbed): LinkEmbed {
  const { imageType, ...embed } = stored
  return imageType ? { ...embed, imageUrl: embedImagePath(messageId) } : embed
}

export interface EmbedState {
  channelId: string
  authorId: string | null
  content: string
  embed: StoredEmbed | null
}

export async function findEmbedState(id: string): Promise<EmbedState | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await db()
    .select({ channelId: messages.channelId, authorId: messages.authorId, content: messages.content, embed: messages.embed })
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1)
  return row
}

export async function setEmbed(id: string, embed: StoredEmbed | null): Promise<boolean> {
  if (!isUuid(id)) return false
  const rows = await db().update(messages).set({ embed }).where(eq(messages.id, id)).returning({ id: messages.id })
  return rows.length > 0
}

export async function messagesWithEmbedImage(ids: string[]): Promise<Set<string>> {
  const valid = ids.filter(isUuid)
  if (valid.length === 0) return new Set()
  const rows = await db()
    .select({ id: messages.id, embed: messages.embed })
    .from(messages)
    .where(and(inArray(messages.id, valid), isNotNull(messages.embed)))
  return new Set(rows.filter((r) => r.embed?.imageType).map((r) => r.id))
}

export interface SearchOptions {
  channelIds: string[]
  query: string
  authorId?: string
  before?: string
}

const likePattern = (query: string): string => `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export async function searchMessages({ channelIds, query, authorId, before }: SearchOptions): Promise<{ messages: Message[]; hasMore: boolean }> {
  const ids = channelIds.filter(isUuid)
  if (ids.length === 0 || (authorId !== undefined && !isUuid(authorId)) || (before !== undefined && !isUuid(before))) return EMPTY_PAGE
  const conditions = [inArray(messages.channelId, ids)]
  if (query) conditions.push(ilike(messages.content, likePattern(query)))
  if (authorId) conditions.push(eq(messages.authorId, authorId))
  if (before) {
    const [ref] = await db().select({ seq: messages.seq }).from(messages).where(eq(messages.id, before)).limit(1)
    if (!ref) return EMPTY_PAGE
    conditions.push(lt(messages.seq, ref.seq))
  }
  const rows = await selectRows()
    .where(and(...conditions))
    .orderBy(desc(messages.seq))
    .limit(SEARCH_PAGE_SIZE + 1)
  return { messages: await toMessages(rows.slice(0, SEARCH_PAGE_SIZE)), hasMore: rows.length > SEARCH_PAGE_SIZE }
}

export async function findPinState(id: string): Promise<{ channelId: string; kind: string; pinned: boolean } | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await db()
    .select({ channelId: messages.channelId, kind: messages.kind, pinnedAt: messages.pinnedAt })
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1)
  return row && { channelId: row.channelId, kind: row.kind, pinned: row.pinnedAt !== null }
}

export async function countPins(channelId: string): Promise<number> {
  const [row] = await db()
    .select({ total: count() })
    .from(messages)
    .where(and(eq(messages.channelId, channelId), isNotNull(messages.pinnedAt)))
  return row?.total ?? 0
}

export async function setPinned(id: string, pinnedBy: string | null): Promise<number | null> {
  const pinnedAt = pinnedBy ? new Date() : null
  await db().update(messages).set({ pinnedAt, pinnedBy }).where(eq(messages.id, id))
  return pinnedAt ? pinnedAt.getTime() : null
}

export async function listPins(channelId: string): Promise<Message[]> {
  if (!isUuid(channelId)) return []
  const rows = await selectRows()
    .where(and(eq(messages.channelId, channelId), isNotNull(messages.pinnedAt)))
    .orderBy(desc(messages.pinnedAt), desc(messages.seq))
  return toMessages(rows)
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
