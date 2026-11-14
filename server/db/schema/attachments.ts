// Anexos das mensagens (o arquivo em si fica no storage: DATA_DIR/uploads/<id>).
import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { messages } from './messages'

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey(),
    /** quem enviou (só ele pode anexar a uma mensagem) */
    uploaderId: uuid('uploader_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** null enquanto não entrou numa mensagem; anexos soltos há mais de 1 h são apagados */
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    /** ordem dentro da mensagem */
    position: integer('position').notNull().default(0),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('attachments_size_check', sql`${t.size} between 1 and 26214400`),
    check('attachments_name_check', sql`char_length(${t.name}) between 1 and 200`),
    index('attachments_message_id_idx').on(t.messageId, t.position),
    index('attachments_unattached_idx').on(t.createdAt).where(sql`${t.messageId} is null`)
  ]
)
