// Preferências da conta (v5). Quem chama valida antes (validateTheme / cleanThemeName).
import { eq } from 'drizzle-orm'
import { DEFAULT_THEME, type Preferences, type PreferencesUpdate } from '../../src/shared/types'
import { db } from '../db/client'
import { accountPreferences } from '../db/schema'
import { isUuid } from './util'

/** Preferências salvas da conta, ou o padrão (tema de hoje, nenhum tema salvo). */
export async function getPreferences(accountId: string): Promise<Preferences> {
  const fallback: Preferences = { theme: DEFAULT_THEME, savedThemes: [], mutedChannels: [] }
  if (!isUuid(accountId)) return fallback
  const [row] = await db().select().from(accountPreferences).where(eq(accountPreferences.accountId, accountId)).limit(1)
  return row ? { theme: row.theme, savedThemes: row.savedThemes, mutedChannels: row.mutedChannels } : fallback
}

/** Grava só os campos enviados (cria o registro na primeira vez). Devolve o resultado. */
export async function updatePreferences(accountId: string, update: PreferencesUpdate): Promise<Preferences> {
  const current = await getPreferences(accountId)
  const next: Preferences = {
    theme: update.theme ?? current.theme,
    savedThemes: update.savedThemes ?? current.savedThemes,
    mutedChannels: update.mutedChannels ?? current.mutedChannels
  }
  await db()
    .insert(accountPreferences)
    .values({ accountId, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: accountPreferences.accountId, set: { ...next, updatedAt: new Date() } })
  return next
}
