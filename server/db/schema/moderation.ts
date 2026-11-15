// Moderação (B6): contas silenciadas pelo servidor nas salas de voz. Uma linha por conta silenciada;
// tirar o silêncio apaga a linha. Fica no banco para o silêncio sobreviver a reiniciar o servidor.
import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'

export const serverMutes = pgTable('server_mutes', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  /** quem silenciou (some se a conta do moderador for apagada) */
  mutedBy: uuid('muted_by').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})
