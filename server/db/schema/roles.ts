// Cargos, cargos de cada conta e regras por canal (v2, contrato em src/shared/types/permissions.ts).
import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { channels } from './channels'

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    /** #rrggbb ou null */
    color: text('color'),
    /** maior = mais importante; @todos é 0 */
    position: integer('position').notNull(),
    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`)
  },
  (t) => [
    check('roles_name_check', sql`char_length(${t.name}) between 1 and 32`),
    check('roles_color_check', sql`${t.color} is null or ${t.color} ~ '^#[0-9a-f]{6}$'`),
    check('roles_position_check', sql`${t.position} >= 0`)
  ]
)

export const memberRoles = pgTable(
  'member_roles',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.accountId, t.roleId] }), index('member_roles_role_id_idx').on(t.roleId)]
)

export const channelOverrides = pgTable(
  'channel_overrides',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    allow: text('allow').array().notNull().default(sql`'{}'::text[]`),
    deny: text('deny').array().notNull().default(sql`'{}'::text[]`)
  },
  (t) => [primaryKey({ columns: [t.channelId, t.roleId] }), index('channel_overrides_role_id_idx').on(t.roleId)]
)
