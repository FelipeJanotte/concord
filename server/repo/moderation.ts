import { desc, eq, or, type SQL } from 'drizzle-orm'
import { db } from '../db/client'
import { accounts, communityBans, serverMutes, serverTimeouts } from '../db/schema'
import { isUuid } from './util'

const validOrNull = (id: string | null): string | null => (id && isUuid(id) ? id : null)

async function ignoringMissingAccount(write: Promise<unknown>): Promise<void> {
  try {
    await write
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } }
    if ((e?.code ?? e?.cause?.code) !== '23503') throw err
  }
}

export async function listServerMutes(): Promise<string[]> {
  const rows = await db().select({ accountId: serverMutes.accountId }).from(serverMutes)
  return rows.map((r) => r.accountId)
}

export async function setServerMute(accountId: string, muted: boolean, mutedBy: string | null = null): Promise<void> {
  if (!isUuid(accountId)) return
  if (!muted) {
    await db().delete(serverMutes).where(eq(serverMutes.accountId, accountId))
    return
  }
  await ignoringMissingAccount(
    db()
      .insert(serverMutes)
      .values({ accountId, mutedBy: validOrNull(mutedBy) })
      .onConflictDoNothing()
  )
}

export interface CommunityBanRecord {
  accountId: string
  email: string
  reason: string | null
  bannedBy: string | null
}

export interface CommunityBanRow {
  accountId: string
  name: string
  tag: string
  reason: string | null
  createdAt: number
}

export async function insertCommunityBan(ban: CommunityBanRecord): Promise<void> {
  if (!isUuid(ban.accountId)) return
  await ignoringMissingAccount(
    db()
      .insert(communityBans)
      .values({ ...ban, bannedBy: validOrNull(ban.bannedBy) })
      .onConflictDoNothing()
  )
}

export async function deleteCommunityBan(accountId: string): Promise<boolean> {
  if (!isUuid(accountId)) return false
  const rows = await db()
    .delete(communityBans)
    .where(eq(communityBans.accountId, accountId))
    .returning({ accountId: communityBans.accountId })
  return rows.length > 0
}

export async function findCommunityBan(by: { accountId?: string; email?: string }): Promise<{ reason: string | null } | undefined> {
  const conditions: SQL[] = []
  if (by.accountId && isUuid(by.accountId)) conditions.push(eq(communityBans.accountId, by.accountId))
  if (by.email) conditions.push(eq(communityBans.email, by.email))
  if (conditions.length === 0) return undefined
  const [row] = await db()
    .select({ reason: communityBans.reason })
    .from(communityBans)
    .where(or(...conditions))
    .limit(1)
  return row
}

export async function listCommunityBans(): Promise<CommunityBanRow[]> {
  const rows = await db()
    .select({
      accountId: communityBans.accountId,
      name: accounts.name,
      tag: accounts.tag,
      reason: communityBans.reason,
      createdAt: communityBans.createdAt
    })
    .from(communityBans)
    .innerJoin(accounts, eq(accounts.id, communityBans.accountId))
    .orderBy(desc(communityBans.createdAt))
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() }))
}

export async function listServerTimeouts(): Promise<{ accountId: string; until: number }[]> {
  const rows = await db().select({ accountId: serverTimeouts.accountId, until: serverTimeouts.until }).from(serverTimeouts)
  return rows.map((r) => ({ accountId: r.accountId, until: r.until.getTime() }))
}

export async function setServerTimeout(accountId: string, until: number | null, timedOutBy: string | null = null): Promise<void> {
  if (!isUuid(accountId)) return
  if (until === null) {
    await db().delete(serverTimeouts).where(eq(serverTimeouts.accountId, accountId))
    return
  }
  const values = { until: new Date(until), timedOutBy: validOrNull(timedOutBy) }
  await ignoringMissingAccount(
    db()
      .insert(serverTimeouts)
      .values({ accountId, ...values })
      .onConflictDoUpdate({ target: serverTimeouts.accountId, set: values })
  )
}
