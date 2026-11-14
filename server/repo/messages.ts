/**
 * Mensagens dos canais de texto.
 *
 * O autor é guardado pela conta (`author_id`) e juntado na leitura, então o
 * histórico mostra nome/foto atuais. A cópia `author_*` só aparece quando a
 * conta não existe mais (ou em mensagens importadas de antes das contas).
 */
import { and, desc, eq, lt } from 'drizzle-orm'
import { HISTORY_PAGE_SIZE, type Message } from '../../src/shared/types'
import { db } from '../db/client'
import { accounts, messages } from '../db/schema'
import { avatarUrl } from './accounts'
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
  return {
    hasMore,
    messages: page.map(({ m, a }) => ({
      id: m.id,
      channelId: m.channelId,
      content: m.content,
      createdAt: m.createdAt.getTime(),
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

/** Grava a mensagem. `author.accountId` vira `author_id` (null se não for uma conta). */
export async function insertMessage(message: Message): Promise<void> {
  await db()
    .insert(messages)
    .values({
      id: message.id,
      channelId: message.channelId,
      authorId: isUuid(message.author.accountId) ? message.author.accountId : null,
      authorName: message.author.name,
      authorTag: message.author.tag,
      authorColor: message.author.color,
      content: message.content,
      createdAt: new Date(message.createdAt)
    })
}
