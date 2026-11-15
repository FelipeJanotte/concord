/**
 * Reações em mensagens (v6, A16). Cada mudança devolve a lista inteira da mensagem, que vai para
 * todos que veem o canal. A ordem dos emojis é a do primeiro a reagir com cada um; a das contas,
 * a ordem em que reagiram.
 */
import { and, asc, countDistinct, eq, inArray } from 'drizzle-orm'
import { REACTIONS_PER_MESSAGE_MAX, type Reaction } from '../../src/shared/types'
import { db } from '../db/client'
import { messageReactions } from '../db/schema'
import { isUuid } from './util'

type Row = { messageId: string; accountId: string; emoji: string }

/** Agrupa as linhas (já em ordem de chegada) em reações por mensagem. */
function group(rows: Row[]): Map<string, Reaction[]> {
  const out = new Map<string, Reaction[]>()
  for (const r of rows) {
    const list = out.get(r.messageId) ?? []
    let reaction = list.find((x) => x.emoji === r.emoji)
    if (!reaction) {
      reaction = { emoji: r.emoji, accountIds: [] }
      list.push(reaction)
    }
    reaction.accountIds.push(r.accountId)
    out.set(r.messageId, list)
  }
  return out
}

/** Reações das mensagens (quem não aparece no mapa não tem nenhuma). */
export async function reactionsByMessage(messageIds: string[]): Promise<Map<string, Reaction[]>> {
  const ids = [...new Set(messageIds)].filter(isUuid)
  if (ids.length === 0) return new Map()
  const rows = await db()
    .select({ messageId: messageReactions.messageId, accountId: messageReactions.accountId, emoji: messageReactions.emoji })
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, ids))
    .orderBy(asc(messageReactions.createdAt), asc(messageReactions.accountId))
  return group(rows)
}

/**
 * Liga ou tira a reação da conta. Devolve a lista nova da mensagem, ou `'limit'` se a mensagem já
 * tem `REACTIONS_PER_MESSAGE_MAX` emojis diferentes e este seria mais um.
 */
export async function setReaction(messageId: string, accountId: string, emoji: string, on: boolean): Promise<Reaction[] | 'limit'> {
  return db().transaction(async (tx) => {
    if (on) {
      const [{ n }] = await tx
        .select({ n: countDistinct(messageReactions.emoji) })
        .from(messageReactions)
        .where(eq(messageReactions.messageId, messageId))
      const [exists] = await tx
        .select({ emoji: messageReactions.emoji })
        .from(messageReactions)
        .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.emoji, emoji)))
        .limit(1)
      if (!exists && n >= REACTIONS_PER_MESSAGE_MAX) return 'limit'
      await tx.insert(messageReactions).values({ messageId, accountId, emoji }).onConflictDoNothing()
    } else {
      await tx
        .delete(messageReactions)
        .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.accountId, accountId), eq(messageReactions.emoji, emoji)))
    }
    const rows = await tx
      .select({ messageId: messageReactions.messageId, accountId: messageReactions.accountId, emoji: messageReactions.emoji })
      .from(messageReactions)
      .where(eq(messageReactions.messageId, messageId))
      .orderBy(asc(messageReactions.createdAt), asc(messageReactions.accountId))
    return group(rows).get(messageId) ?? []
  })
}
