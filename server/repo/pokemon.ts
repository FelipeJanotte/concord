import { asc, count, eq } from 'drizzle-orm'
import type { GameState, Mon } from '../../src/shared/pokemon/game'
import type { MarketListing } from '../../src/shared/types'
import { db } from '../db/client'
import { accounts, pokemonListings, pokemonSaves } from '../db/schema'
import { isUuid } from './util'

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0]

const columns = {
  id: pokemonListings.id,
  sellerId: pokemonListings.sellerId,
  sellerName: accounts.name,
  item: pokemonListings.item,
  quantity: pokemonListings.quantity,
  mon: pokemonListings.mon,
  price: pokemonListings.price,
  createdAt: pokemonListings.createdAt
}

const selectListings = () => db().select(columns).from(pokemonListings).innerJoin(accounts, eq(accounts.id, pokemonListings.sellerId))

type Row = Awaited<ReturnType<typeof selectListings>>[number]

const toListing = (row: Row): MarketListing => ({
  id: row.id,
  seller: { accountId: row.sellerId, name: row.sellerName },
  item: row.item,
  quantity: row.quantity,
  mon: row.mon,
  price: row.price,
  createdAt: row.createdAt.toISOString()
})

async function writeGame(tx: Tx | ReturnType<typeof db>, accountId: string, state: GameState): Promise<void> {
  await tx
    .insert(pokemonSaves)
    .values({ accountId, state, updatedAt: new Date() })
    .onConflictDoUpdate({ target: pokemonSaves.accountId, set: { state, updatedAt: new Date() } })
}

export async function loadGame(accountId: string): Promise<GameState | null> {
  if (!isUuid(accountId)) return null
  const [row] = await db().select({ state: pokemonSaves.state }).from(pokemonSaves).where(eq(pokemonSaves.accountId, accountId)).limit(1)
  return row?.state ?? null
}

export async function saveGame(accountId: string, state: GameState): Promise<void> {
  await writeGame(db(), accountId, state)
}

export async function listListings(): Promise<MarketListing[]> {
  const rows = await selectListings().orderBy(asc(pokemonListings.createdAt))
  return rows.map(toListing)
}

export async function findListing(id: string): Promise<MarketListing | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await selectListings().where(eq(pokemonListings.id, id)).limit(1)
  return row && toListing(row)
}

export async function countListings(sellerId: string): Promise<number> {
  const [row] = await db().select({ n: count() }).from(pokemonListings).where(eq(pokemonListings.sellerId, sellerId))
  return row?.n ?? 0
}

export interface NewListing {
  id: string
  sellerId: string
  item: string | null
  quantity: number
  mon: Mon | null
  price: number
}

export async function createListing(listing: NewListing, sellerGame: GameState): Promise<MarketListing> {
  await db().transaction(async (tx) => {
    await writeGame(tx, listing.sellerId, sellerGame)
    await tx.insert(pokemonListings).values(listing)
  })
  const found = await findListing(listing.id)
  if (!found) throw new Error('anúncio criado não encontrado')
  return found
}

export async function closeListing(listingId: string, games: { accountId: string; game: GameState }[]): Promise<boolean> {
  return db().transaction(async (tx) => {
    const removed = await tx.delete(pokemonListings).where(eq(pokemonListings.id, listingId)).returning({ id: pokemonListings.id })
    if (removed.length === 0) return false
    for (const { accountId, game } of games) await writeGame(tx, accountId, game)
    return true
  })
}
