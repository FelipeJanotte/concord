// Mensagens dos canais de texto (e conversas privadas); `kind: 'tool'` = resultado de ferramenta (v4).
import { sql } from 'drizzle-orm'
import { bigserial, check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { ToolPayload } from '../../../src/shared/types'
import { accounts } from './accounts'
import { channels } from './channels'

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    /** ordem de chegada (estável mesmo com duas mensagens no mesmo milissegundo); é o cursor da paginação */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    /** conta do autor; null se a conta deixou de existir (ou mensagem importada de antes das contas) */
    authorId: uuid('author_id').references(() => accounts.id, { onDelete: 'set null' }),
    // Cópia do autor no envio: usada só quando não há conta para juntar (author_id null).
    authorName: text('author_name').notNull(),
    authorTag: text('author_tag').notNull().default(''),
    authorColor: text('author_color').notNull(),
    content: text('content').notNull(),
    /** 'text' | 'tool' (ver src/shared/types/message.ts) */
    kind: text('kind').notNull().default('text'),
    /** resultado tipado da ferramenta; só (e sempre) em kind = 'tool' */
    tool: jsonb('tool').$type<ToolPayload>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    // Vazio é permitido para mensagem só com anexos (o servidor exige texto ou anexo).
    check('messages_content_check', sql`char_length(${t.content}) <= 2000`),
    check('messages_kind_check', sql`${t.kind} in ('text', 'tool')`),
    check('messages_tool_check', sql`(${t.kind} = 'tool') = (${t.tool} is not null)`),
    index('messages_channel_seq_idx').on(t.channelId, t.seq.desc()),
    index('messages_author_id_idx').on(t.authorId)
  ]
)
