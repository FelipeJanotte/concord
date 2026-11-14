// Contas e sessões de login.
import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    /** sempre em minúsculas */
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** id escolhido pela pessoa (nome#tag); único sem diferenciar maiúsculas */
    tag: text('tag').notNull(),
    /** false só em contas do Google que ainda não escolheram o id definitivo */
    tagLocked: boolean('tag_locked').notNull().default(true),
    color: text('color').notNull(),
    /** `scrypt$<salt>$<hash>` ou null para contas só com Google */
    passwordHash: text('password_hash'),
    /** `sub` do Google, quando vinculada */
    googleId: text('google_id'),
    /** content-type da foto em DATA_DIR/avatars/<id>, ou null sem foto */
    avatarType: text('avatar_type'),
    avatarVersion: integer('avatar_version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex('accounts_email_key').on(t.email),
    uniqueIndex('accounts_tag_lower_key').on(sql`lower(${t.tag})`),
    uniqueIndex('accounts_google_id_key').on(t.googleId)
  ]
)

export const sessions = pgTable(
  'sessions',
  {
    /** sha256 do token (o token em si nunca é salvo) */
    tokenHash: text('token_hash').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
  },
  (t) => [index('sessions_account_id_idx').on(t.accountId), index('sessions_expires_at_idx').on(t.expiresAt)]
)
