/**
 * Amizades (v3): cada lado da relação tem a sua linha (`account_id` vê `other_id` como `status`).
 * As operações que mexem nos dois lados rodam numa transação.
 */
import { and, count, eq, inArray, or, sql } from 'drizzle-orm'
import type { FriendAccount, FriendStatus } from '../../src/shared/types'
import { db, type Database } from '../db/client'
import { accounts, friendships } from '../db/schema'
import { avatarUrl } from './accounts'
import { isUuid } from './util'

export interface Relation {
  status: FriendStatus
  since: number
}

export interface RelationWithAccount extends Relation {
  account: FriendAccount
}

const toAccount = (a: typeof accounts.$inferSelect): FriendAccount => ({
  id: a.id,
  name: a.name,
  tag: a.tag,
  color: a.color,
  avatarUrl: avatarUrl(a)
})

/** Como `me` vê `other` (ou undefined se não há relação). */
export async function getRelation(me: string, other: string): Promise<Relation | undefined> {
  if (!isUuid(me) || !isUuid(other)) return undefined
  const [row] = await db()
    .select()
    .from(friendships)
    .where(and(eq(friendships.accountId, me), eq(friendships.otherId, other)))
    .limit(1)
  return row && { status: row.status as FriendStatus, since: row.since.getTime() }
}

/** Todas as relações de `me`, com os dados públicos da outra conta. */
export async function listRelations(me: string): Promise<RelationWithAccount[]> {
  if (!isUuid(me)) return []
  const rows = await db()
    .select({ f: friendships, a: accounts })
    .from(friendships)
    .innerJoin(accounts, eq(accounts.id, friendships.otherId))
    .where(eq(friendships.accountId, me))
  return rows.map(({ f, a }) => ({ status: f.status as FriendStatus, since: f.since.getTime(), account: toAccount(a) }))
}

/** Relação de `me` com `other` já com os dados da outra conta. */
export async function getRelationWithAccount(me: string, other: string): Promise<RelationWithAccount | undefined> {
  return (await listRelations(me)).find((r) => r.account.id === other)
}

/** Ids das contas que são amigas de `me`. */
export async function friendIds(me: string): Promise<string[]> {
  if (!isUuid(me)) return []
  const rows = await db()
    .select({ id: friendships.otherId })
    .from(friendships)
    .where(and(eq(friendships.accountId, me), eq(friendships.status, 'friend')))
  return rows.map((r) => r.id)
}

/** Quantos pedidos `me` enviou e ainda estão pendentes. */
export async function countOutgoing(me: string): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(friendships)
    .where(and(eq(friendships.accountId, me), eq(friendships.status, 'outgoing')))
  return Number(row?.n ?? 0)
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

async function upsert(tx: Tx, accountId: string, otherId: string, status: FriendStatus, since: Date): Promise<void> {
  await tx
    .insert(friendships)
    .values({ accountId, otherId, status, since })
    .onConflictDoUpdate({ target: [friendships.accountId, friendships.otherId], set: { status, since } })
}

/** `me` pede amizade a `other`: eu fico `outgoing`, a outra pessoa `incoming`. */
export async function sendRequest(me: string, other: string): Promise<void> {
  const now = new Date()
  await db().transaction(async (tx) => {
    await upsert(tx, me, other, 'outgoing', now)
    await upsert(tx, other, me, 'incoming', now)
  })
}

/** Os dois lados viram amigos. */
export async function makeFriends(a: string, b: string): Promise<void> {
  const now = new Date()
  await db().transaction(async (tx) => {
    await upsert(tx, a, b, 'friend', now)
    await upsert(tx, b, a, 'friend', now)
  })
}

/** Apaga a relação dos dois lados (recusar, cancelar, desfazer). */
export async function deletePair(a: string, b: string): Promise<void> {
  await db()
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.accountId, a), eq(friendships.otherId, b)),
        and(eq(friendships.accountId, b), eq(friendships.otherId, a))
      )
    )
}

/**
 * `me` bloqueia `other`: o meu lado vira `blocked`; o lado da outra pessoa some (ela deixa
 * de ver qualquer relação comigo). Se ela também tinha me bloqueado, o bloqueio dela fica.
 */
export async function block(me: string, other: string): Promise<void> {
  const now = new Date()
  await db().transaction(async (tx) => {
    await upsert(tx, me, other, 'blocked', now)
    await tx
      .delete(friendships)
      .where(and(eq(friendships.accountId, other), eq(friendships.otherId, me), inArray(friendships.status, ['friend', 'outgoing', 'incoming'])))
  })
}

/** Tira o bloqueio de `me` sobre `other` (a relação some). */
export async function unblock(me: string, other: string): Promise<boolean> {
  const rows = await db()
    .delete(friendships)
    .where(and(eq(friendships.accountId, me), eq(friendships.otherId, other), eq(friendships.status, 'blocked')))
    .returning({ id: friendships.otherId })
  return rows.length > 0
}

/** Conta pelo id (tag), sem diferenciar maiúsculas — para o pedido por `nome#id` (usa o índice de `lower(tag)`). */
export async function findAccountByTag(tag: string): Promise<FriendAccount | undefined> {
  const [a] = await db().select().from(accounts).where(sql`lower(${accounts.tag}) = lower(${tag})`).limit(1)
  return a && toAccount(a)
}
