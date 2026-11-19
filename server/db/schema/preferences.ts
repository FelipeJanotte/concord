// Preferências da conta guardadas no servidor (v5: tema ativo e temas salvos).
import { boolean, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { SavedTheme, ThemeConfig } from '../../../src/shared/types'
import { accounts } from './accounts'

export const accountPreferences = pgTable('account_preferences', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  /** validado com `validateTheme` antes de gravar */
  theme: jsonb('theme').$type<ThemeConfig>().notNull(),
  savedThemes: jsonb('saved_themes').$type<SavedTheme[]>().notNull().default([]),
  mutedChannels: jsonb('muted_channels').$type<string[]>().notNull().default([]),
  doNotDisturb: boolean('do_not_disturb').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
