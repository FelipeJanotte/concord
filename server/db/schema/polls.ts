// Votos das enquetes (v4): uma linha por opção marcada por conta. A enquete em si é a mensagem
// `kind: 'tool'` (com as contagens em `messages.tool`, atualizadas a cada voto).
import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { messages } from './messages'

export const pollVotes = pgTable(
  'poll_votes',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** índice da opção (0–9) */
    choice: integer('choice').notNull()
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.accountId, t.choice] }),
    check('poll_votes_choice_check', sql`${t.choice} between 0 and 9`),
    index('poll_votes_account_id_idx').on(t.accountId)
  ]
)
