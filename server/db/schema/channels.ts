// Canais de texto e voz.
import { sql } from 'drizzle-orm'
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    /** 'text' | 'voice' (texto + check em vez de enum: acrescentar um tipo é só trocar o check) */
    type: text('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('channels_type_check', sql`${t.type} in ('text', 'voice')`),
    check('channels_name_check', sql`char_length(${t.name}) between 1 and 32`),
    uniqueIndex('channels_type_name_lower_key').on(t.type, sql`lower(${t.name})`)
  ]
)
