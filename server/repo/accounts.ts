/**
 * Acesso às contas. Todas as funções são async e devolvem objetos novos: quem
 * chama altera a conta só por `updateAccount`.
 */
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db, uniqueViolation } from '../db/client'
import { accounts } from '../db/schema'
import type { Account } from './types'
import { DuplicateError, isUuid } from './util'

type Row = typeof accounts.$inferSelect

const toAccount = (row: Row): Account => ({ ...row, createdAt: row.createdAt.getTime() })

/** Caminho público da foto (`/avatars/<id>?v=<versão>`), ou null sem foto. */
export function avatarUrl(a: Pick<Account, 'id' | 'avatarType' | 'avatarVersion'>): string | null {
  return a.avatarType ? `/avatars/${a.id}?v=${a.avatarVersion}` : null
}

/** Nome atual de cada conta (para as menções, B19). Ids inválidos ou inexistentes ficam de fora. */
export async function accountNames(ids: string[]): Promise<Map<string, string>> {
  const valid = [...new Set(ids)].filter(isUuid)
  if (valid.length === 0) return new Map()
  const rows = await db().select({ id: accounts.id, name: accounts.name }).from(accounts).where(inArray(accounts.id, valid))
  return new Map(rows.map((r) => [r.id, r.name]))
}

export async function findAccount(id: string): Promise<Account | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await db().select().from(accounts).where(eq(accounts.id, id)).limit(1)
  return row && toAccount(row)
}

/** `email` já normalizado (minúsculo). */
export async function findAccountByEmail(email: string): Promise<Account | undefined> {
  const [row] = await db().select().from(accounts).where(eq(accounts.email, email)).limit(1)
  return row && toAccount(row)
}

export async function findAccountByGoogleId(googleId: string): Promise<Account | undefined> {
  const [row] = await db().select().from(accounts).where(eq(accounts.googleId, googleId)).limit(1)
  return row && toAccount(row)
}

/** O id (tag) é único sem diferenciar maiúsculas. */
export async function isTagTaken(tag: string, exceptAccountId?: string): Promise<boolean> {
  const sameTag = sql`lower(${accounts.tag}) = lower(${tag})`
  const where = exceptAccountId && isUuid(exceptAccountId) ? and(sameTag, ne(accounts.id, exceptAccountId)) : sameTag
  const rows = await db().select({ id: accounts.id }).from(accounts).where(where).limit(1)
  return rows.length > 0
}

const DUPLICATE_FIELD: Record<string, string> = {
  accounts_email_key: 'email',
  accounts_tag_lower_key: 'tag',
  accounts_google_id_key: 'googleId'
}

function rethrowDuplicate(err: unknown): never {
  const constraint = uniqueViolation(err)
  if (constraint !== null) throw new DuplicateError(DUPLICATE_FIELD[constraint] ?? constraint)
  throw err
}

/** Lança `DuplicateError` se e-mail, id ou Google id já existirem (garantido pelo banco). */
export async function insertAccount(account: Account): Promise<Account> {
  try {
    const [row] = await db()
      .insert(accounts)
      .values({ ...account, createdAt: new Date(account.createdAt) })
      .returning()
    return toAccount(row)
  } catch (err) {
    rethrowDuplicate(err)
  }
}

export async function updateAccount(
  id: string,
  patch: Partial<Omit<Account, 'id' | 'createdAt'>>
): Promise<Account | undefined> {
  if (!isUuid(id)) return undefined
  try {
    const [row] = await db().update(accounts).set(patch).where(eq(accounts.id, id)).returning()
    return row && toAccount(row)
  } catch (err) {
    rethrowDuplicate(err)
  }
}
