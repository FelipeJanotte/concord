import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { GameState, Mon } from '../../../src/shared/pokemon/game'
import { accounts } from './accounts'

export const pokemonSaves = pgTable('pokemon_saves', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  state: jsonb('state').$type<GameState>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export const pokemonListings = pgTable(
  'pokemon_listings',
  {
    id: uuid('id').primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    item: text('item'),
    quantity: integer('quantity').notNull(),
    mon: jsonb('mon').$type<Mon>(),
    price: integer('price').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('pokemon_listings_price_check', sql`${t.price} > 0`),
    check('pokemon_listings_quantity_check', sql`${t.quantity} > 0`),
    check('pokemon_listings_kind_check', sql`(${t.item} is null) <> (${t.mon} is null)`),
    index('pokemon_listings_seller_idx').on(t.sellerId)
  ]
)
