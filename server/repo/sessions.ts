// Sessões de login (só o hash do token é guardado).
import { and, eq, gte, lt } from 'drizzle-orm'
import { db } from '../db/client'
import { sessions } from '../db/schema'
import type { Session } from './types'
import { isUuid } from './util'

/** Grava a sessão e aproveita para apagar as expiradas. */
export async function insertSession(session: Session): Promise<void> {
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()))
  await db()
    .insert(sessions)
    .values({ ...session, expiresAt: new Date(session.expiresAt) })
}

/** Devolve a sessão só se ainda for válida. */
export async function findValidSession(tokenHash: string): Promise<Session | undefined> {
  const [row] = await db()
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gte(sessions.expiresAt, new Date())))
    .limit(1)
  return row && { ...row, expiresAt: row.expiresAt.getTime() }
}

/** Apaga as sessões vencidas. Devolve quantas. */
export async function deleteExpiredSessions(now = new Date()): Promise<number> {
  const rows = await db().delete(sessions).where(lt(sessions.expiresAt, now)).returning({ t: sessions.tokenHash })
  return rows.length
}

export async function renewSession(tokenHash: string, expiresAt: number): Promise<void> {
  await db()
    .update(sessions)
    .set({ expiresAt: new Date(expiresAt) })
    .where(eq(sessions.tokenHash, tokenHash))
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.tokenHash, tokenHash))
}

export async function deleteAccountSessions(accountId: string): Promise<void> {
  if (!isUuid(accountId)) return
  await db().delete(sessions).where(eq(sessions.accountId, accountId))
}
