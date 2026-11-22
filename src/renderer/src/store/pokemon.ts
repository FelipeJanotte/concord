import type { DexEntry, MarketListing } from '@shared/types'
import type { AutoSettings } from '@shared/pokemon/auto'
import type { GameState, Hit } from '@shared/pokemon/game'
import type { BallId } from '@shared/pokemon/items'
import type { RegionId } from '@shared/pokemon/regions'

export type PokemonScreen = 'map' | 'bag' | 'pc' | 'shop'

export interface BallThrow {
  ball: BallId
  result: 'shaking' | 'caught' | 'escaped'
}

export interface PokemonState {
  pokemonGame: GameState | null
  pokemonLoaded: boolean
  pokemonScreen: PokemonScreen
  pokemonListings: MarketListing[]
  pokemonBusy: boolean
  pokemonError: string | null
  pokemonNotice: string | null
  pokemonAuto: AutoSettings
  pokemonThrow: BallThrow | null
  pokemonHit: (Hit & { seq: number }) | null
  pokemonDex: Partial<Record<RegionId, DexEntry[]>>
}

export const pokemonInitial: PokemonState = {
  pokemonGame: null,
  pokemonLoaded: false,
  pokemonScreen: 'map',
  pokemonListings: [],
  pokemonBusy: false,
  pokemonError: null,
  pokemonNotice: null,
  pokemonAuto: { fight: false, catch: false, balls: ['pokeball'] },
  pokemonThrow: null,
  pokemonHit: null,
  pokemonDex: {}
}
