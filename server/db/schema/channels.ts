// Canais de texto e voz, e as conversas privadas (dm, v3) com seus membros.
import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'

export const channelCategories = pgTable(
  'channel_categories',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [check('channel_categories_name_check', sql`char_length(${t.name}) between 1 and 32`)]
)

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    /** 'text' | 'voice' | 'dm' (texto + check em vez de enum: acrescentar um tipo é só trocar o check) */
    type: text('type').notNull(),
    position: integer('position').notNull().default(0),
    categoryId: uuid('category_id').references(() => channelCategories.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('channels_type_check', sql`${t.type} in ('text', 'voice', 'dm')`),
    check('channels_name_check', sql`char_length(${t.name}) between 1 and 32`),
    uniqueIndex('channels_type_name_lower_key').on(t.type, sql`lower(${t.name})`)
  ]
)

/**
 * Membros de um canal `dm` (sempre dois). Canais da comunidade não têm linhas aqui:
 * quem vê é decidido pelos cargos (v2).
 */
export const channelMembers = pgTable(
  'channel_members',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.channelId, t.accountId] }), index('channel_members_account_id_idx').on(t.accountId)]
)
