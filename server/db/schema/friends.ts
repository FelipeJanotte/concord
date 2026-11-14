// Amizades (v3): uma linha por LADO da relação (account_id = de quem é o ponto de vista).
import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'

export const friendships = pgTable(
  'friendships',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    otherId: uuid('other_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** 'friend' | 'outgoing' | 'incoming' | 'blocked' (ver src/shared/types/friends.ts) */
    status: text('status').notNull(),
    since: timestamp('since', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.otherId] }),
    check('friendships_status_check', sql`${t.status} in ('friend', 'outgoing', 'incoming', 'blocked')`),
    check('friendships_not_self_check', sql`${t.accountId} <> ${t.otherId}`),
    index('friendships_other_id_idx').on(t.otherId)
  ]
)
