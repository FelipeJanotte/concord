/**
 * Acesso às contas. Todas as funções são async e devolvem cópias: quem chama
 * nunca altera o registro direto, sempre passa por `updateAccount`. Assim a
 * troca do JSON por Postgres (v1/A1) só mexe nesta pasta.
 */
import { db, save } from '../db'
import type { Account } from './types'

const copy = (a: Account | undefined): Account | undefined => (a ? { ...a } : undefined)

export async function findAccount(id: string): Promise<Account | undefined> {
  return copy(db.accounts.find((a) => a.id === id))
}

/** `email` já normalizado (minúsculo). */
export async function findAccountByEmail(email: string): Promise<Account | undefined> {
  return copy(db.accounts.find((a) => a.email === email))
}

export async function findAccountByGoogleId(googleId: string): Promise<Account | undefined> {
  return copy(db.accounts.find((a) => a.googleId === googleId))
}

/** O id (tag) é único sem diferenciar maiúsculas. */
export async function isTagTaken(tag: string, exceptAccountId?: string): Promise<boolean> {
  const t = tag.toLowerCase()
  return db.accounts.some((a) => a.id !== exceptAccountId && a.tag.toLowerCase() === t)
}

export async function insertAccount(account: Account): Promise<Account> {
  db.accounts.push({ ...account })
  save()
  return { ...account }
}

export async function updateAccount(id: string, patch: Partial<Omit<Account, 'id'>>): Promise<Account | undefined> {
  const account = db.accounts.find((a) => a.id === id)
  if (!account) return undefined
  Object.assign(account, patch)
  save()
  return { ...account }
}
