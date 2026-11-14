// Sessões de login (só o hash do token é guardado).
import { db, save } from '../db'
import type { Session } from './types'

/** Grava a sessão e aproveita para descartar as expiradas. */
export async function insertSession(session: Session): Promise<void> {
  const now = Date.now()
  db.sessions = db.sessions.filter((s) => s.expiresAt > now)
  db.sessions.push({ ...session })
  save()
}

/** Devolve a sessão só se ainda for válida. */
export async function findValidSession(tokenHash: string): Promise<Session | undefined> {
  const session = db.sessions.find((s) => s.tokenHash === tokenHash)
  return session && session.expiresAt >= Date.now() ? { ...session } : undefined
}

export async function deleteSession(tokenHash: string): Promise<void> {
  const before = db.sessions.length
  db.sessions = db.sessions.filter((s) => s.tokenHash !== tokenHash)
  if (db.sessions.length !== before) save()
}
