import { and, eq, inArray, isNull, lt, max, ne, or, sql } from 'drizzle-orm'
import type { ChannelReadState } from '../../src/shared/types'
import { db } from '../db/client'
import { channelReads, messages } from '../db/schema'
import { isUuid } from './util'

export type ReadAdvance = 'advanced' | 'unchanged' | 'missing'

export async function advanceRead(accountId: string, channelId: string, messageId: string): Promise<ReadAdvance> {
  if (!isUuid(accountId) || !isUuid(channelId) || !isUuid(messageId)) return 'missing'
  const [message] = await db()
    .select({ seq: messages.seq })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.channelId, channelId)))
    .limit(1)
  if (!message) return 'missing'
  const now = new Date()
  const changed = await db()
    .insert(channelReads)
    .values({ accountId, channelId, lastReadId: messageId, lastReadSeq: message.seq, updatedAt: now })
    .onConflictDoUpdate({
      target: [channelReads.accountId, channelReads.channelId],
      set: { lastReadId: messageId, lastReadSeq: message.seq, updatedAt: now },
      setWhere: lt(channelReads.lastReadSeq, sql`excluded.last_read_seq`)
    })
    .returning({ channelId: channelReads.channelId })
  return changed.length ? 'advanced' : 'unchanged'
}

export async function readStates(accountId: string, channelIds: readonly string[]): Promise<ChannelReadState[]> {
  const ids = [...new Set(channelIds)].filter(isUuid)
  if (!isUuid(accountId) || ids.length === 0) return []
  const reads = await db()
    .select({ channelId: channelReads.channelId, lastReadId: channelReads.lastReadId, lastReadSeq: channelReads.lastReadSeq })
    .from(channelReads)
    .where(and(eq(channelReads.accountId, accountId), inArray(channelReads.channelId, ids)))
  const latest = await db()
    .select({ channelId: messages.channelId, seq: max(messages.seq) })
    .from(messages)
    .where(and(inArray(messages.channelId, ids), or(isNull(messages.authorId), ne(messages.authorId, accountId))))
    .groupBy(messages.channelId)
  const readBy = new Map(reads.map((r) => [r.channelId, r]))
  const latestBy = new Map(latest.map((l) => [l.channelId, Number(l.seq)]))
  return ids.map((channelId) => {
    const read = readBy.get(channelId)
    const newest = latestBy.get(channelId)
    return {
      channelId,
      lastReadId: read?.lastReadId ?? null,
      unread: newest !== undefined && newest > (read?.lastReadSeq ?? 0)
    }
  })
}
