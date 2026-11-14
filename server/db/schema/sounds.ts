// Efeitos sonoros da comunidade (soundboard, A10). Os bytes ficam em DATA_DIR/sounds/<id>.
import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'

export const sounds = pgTable(
  'sounds',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    /** conta que enviou; null se a conta deixou de existir */
    uploaderId: uuid('uploader_id').references(() => accounts.id, { onDelete: 'set null' }),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    durationMs: integer('duration_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('sounds_name_check', sql`char_length(${t.name}) between 1 and 32`),
    check('sounds_emoji_check', sql`${t.emoji} is null or char_length(${t.emoji}) between 1 and 8`),
    check('sounds_size_check', sql`${t.size} between 1 and 524288`),
    check('sounds_duration_check', sql`${t.durationMs} between 1 and 5000`),
    check('sounds_type_check', sql`${t.contentType} in ('audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm')`),
    uniqueIndex('sounds_name_lower_key').on(sql`lower(${t.name})`),
    index('sounds_uploader_id_idx').on(t.uploaderId)
  ]
)
