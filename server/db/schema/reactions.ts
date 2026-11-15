// Reações em mensagens (v6, A16): uma linha por emoji de cada conta em cada mensagem.
import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { messages } from './messages'

export const messageReactions = pgTable(
  'message_reactions',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    /** ordem das reações (quem reagiu primeiro e a ordem dos emojis na mensagem) */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.accountId, t.emoji] }),
    check('message_reactions_emoji_check', sql`char_length(${t.emoji}) between 1 and 8`),
    index('message_reactions_account_id_idx').on(t.accountId)
  ]
)
