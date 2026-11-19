import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'

export const savedPlaylists = pgTable(
  'saved_playlists',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    kind: text('kind').notNull(),
    savedBy: uuid('saved_by')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('saved_playlists_name_check', sql`char_length(${t.name}) between 1 and 60`),
    check('saved_playlists_kind_check', sql`${t.kind} in ('playlist', 'album')`),
    uniqueIndex('saved_playlists_name_lower_key').on(sql`lower(${t.name})`),
    uniqueIndex('saved_playlists_url_key').on(t.url),
    index('saved_playlists_saved_by_idx').on(t.savedBy)
  ]
)
