import type { BattleAction, GameState, Mon } from '../pokemon/game'
import type { Dir, Tile } from '../pokemon/map'
import type { RegionId } from '../pokemon/regions'

export const MARKET_PRICE_MAX = 100_000_000
export const MARKET_LISTINGS_PER_SELLER = 20

export type PokemonAction =
  | { type: 'start'; starter: number; look: string }
  | { type: 'walk'; dir: Dir }
  | { type: 'battle'; action: BattleAction }
  | { type: 'leave-battle' }
  | { type: 'travel'; region: RegionId; hunt?: number }
  | { type: 'evolve'; uid: string }
  | { type: 'enter-center' }
  | { type: 'deposit'; uid: string }
  | { type: 'withdraw'; uid: string }
  | { type: 'buy'; item: string; quantity: number }
  | { type: 'hold'; uid: string; item: string | null }
  | { type: 'set-moves'; uid: string; moves: string[] }

export type PokemonResult = { ok: true; game: GameState | null; tile?: Tile } | { ok: false; error: string }

export interface MarketSeller {
  accountId: string
  name: string
}

export interface MarketListing {
  id: string
  seller: MarketSeller
  item: string | null
  quantity: number
  mon: Mon | null
  price: number
  createdAt: string
}

export type SellRequest = { kind: 'item'; item: string; quantity: number; price: number } | { kind: 'mon'; uid: string; price: number }

export interface DexEntry {
  id: number
  name: string
  types: string[]
}

export type DexResult = { ok: true; entries: DexEntry[] } | { ok: false; error: string }

export type MarketListResult = { ok: true; listings: MarketListing[] } | { ok: false; error: string }

export interface PokemonServerEvents {
  'pokemon:state': (game: GameState) => void
  'pokemon:listing-added': (listing: MarketListing) => void
  'pokemon:listing-removed': (payload: { id: string }) => void
}

export interface PokemonClientEvents {
  'pokemon:get': (ack: (res: PokemonResult) => void) => void
  'pokemon:act': (action: PokemonAction, ack: (res: PokemonResult) => void) => void
  'pokemon:dex': (region: RegionId, ack: (res: DexResult) => void) => void
  'pokemon:listings': (ack: (res: MarketListResult) => void) => void
  'pokemon:sell': (request: SellRequest, ack: (res: PokemonResult) => void) => void
  'pokemon:buy-listing': (id: string, ack: (res: PokemonResult) => void) => void
  'pokemon:cancel-listing': (id: string, ack: (res: PokemonResult) => void) => void
}
