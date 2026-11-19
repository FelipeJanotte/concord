// Moderação (B6): contas silenciadas pelo servidor nas salas de voz. Uma linha por conta silenciada;
// tirar o silêncio apaga a linha. Fica no banco para o silêncio sobreviver a reiniciar o servidor.
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'

export const serverMutes = pgTable('server_mutes', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  /** quem silenciou (some se a conta do moderador for apagada) */
  mutedBy: uuid('muted_by').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const communityBans = pgTable(
  'community_bans',
  {
    accountId: uuid('account_id')
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    reason: text('reason'),
    bannedBy: uuid('banned_by').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index('community_bans_email_idx').on(t.email)]
)

export const serverTimeouts = pgTable('server_timeouts', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  until: timestamp('until', { withTimezone: true }).notNull(),
  timedOutBy: uuid('timed_out_by').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})
