/**
 * Conversas privadas (v3): um DM é um canal do tipo `dm` com duas linhas em `channel_members`.
 *
 * O nome do canal é um hash do par de contas (ordenado), então o índice único de
 * `(type, lower(name))` garante no banco UMA conversa por par, mesmo com dois `dm:open` ao mesmo tempo.
 */
import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Channel, DmEntry } from '../../src/shared/types'
import { db, uniqueViolation } from '../db/client'
import { accounts, channelMembers, channels } from '../db/schema'
import { toFriendAccount } from './friends'
import { isUuid } from './util'

/** Nome interno (32 caracteres, cabe no check do nome) — igual para (a, b) e (b, a). */
export function dmName(a: string, b: string): string {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort()
  return createHash('sha256').update(`${x}|${y}`).digest('hex').slice(0, 32)
}

const toChannel = (row: typeof channels.$inferSelect): Channel => ({
  id: row.id,
  name: row.name,
  type: 'dm',
  createdAt: row.createdAt.getTime()
})

/** A conversa entre `a` e `b`, se existir. */
export async function findDm(a: string, b: string): Promise<Channel | undefined> {
  if (!isUuid(a) || !isUuid(b) || a === b) return undefined
  const [row] = await db()
    .select()
    .from(channels)
    .where(and(eq(channels.type, 'dm'), eq(channels.name, dmName(a, b))))
    .limit(1)
  return row && toChannel(row)
}

/**
 * Cria a conversa (canal + os dois membros, numa transação). Se já existir (inclusive criada
 * agora por outra conexão), devolve a existente com `created: false`.
 */
export async function openDm(a: string, b: string): Promise<{ channel: Channel; created: boolean }> {
  const existing = await findDm(a, b)
  if (existing) return { channel: existing, created: false }
  const channel: Channel = { id: randomUUID(), name: dmName(a, b), type: 'dm', createdAt: Date.now() }
  try {
    await db().transaction(async (tx) => {
      await tx.insert(channels).values({ ...channel, createdAt: new Date(channel.createdAt) })
      await tx.insert(channelMembers).values([
        { channelId: channel.id, accountId: a },
        { channelId: channel.id, accountId: b }
      ])
    })
    return { channel, created: true }
  } catch (err) {
    if (uniqueViolation(err) === null) throw err
    const raced = await findDm(a, b)
    if (!raced) throw err
    return { channel: raced, created: false }
  }
}

const other = alias(channelMembers, 'other_member')

/** As conversas de `me`, mais recentes primeiro, com os dados públicos da outra pessoa. */
export async function listDms(me: string): Promise<DmEntry[]> {
  if (!isUuid(me)) return []
  const rows = await db()
    .select({ c: channels, a: accounts })
    .from(channelMembers)
    .innerJoin(channels, and(eq(channels.id, channelMembers.channelId), eq(channels.type, 'dm')))
    .innerJoin(other, and(eq(other.channelId, channels.id), ne(other.accountId, me)))
    .innerJoin(accounts, eq(accounts.id, other.accountId))
    .where(eq(channelMembers.accountId, me))
    .orderBy(desc(channels.createdAt), desc(channels.id))
  return rows.map(({ c, a }) => ({ channel: toChannel(c), other: toFriendAccount(a) }))
}

/** Todos os membros de todas as conversas (o cache de acesso carrega isso no boot). */
export async function listDmMembers(): Promise<Array<{ channelId: string; accountId: string }>> {
  return db()
    .select({ channelId: channelMembers.channelId, accountId: channelMembers.accountId })
    .from(channelMembers)
    .innerJoin(channels, and(eq(channels.id, channelMembers.channelId), eq(channels.type, 'dm')))
}
