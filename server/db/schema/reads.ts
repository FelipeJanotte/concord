import { bigint, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { channels } from './channels'

export const channelReads = pgTable(
  'channel_reads',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    lastReadId: uuid('last_read_id').notNull(),
    lastReadSeq: bigint('last_read_seq', { mode: 'number' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.accountId, t.channelId] })]
)
