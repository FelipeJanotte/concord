// Sessões de login (só o hash do token é guardado).
import { and, eq, gte, lt } from 'drizzle-orm'
import { db } from '../db/client'
import { sessions } from '../db/schema'
import type { Session } from './types'

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

export async function deleteSession(tokenHash: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.tokenHash, tokenHash))
}
