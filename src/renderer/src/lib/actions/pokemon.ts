import type { MarketListing, PokemonAction, PokemonResult, SellRequest } from '@shared/types'
import { autoAction, type AutoSettings } from '@shared/pokemon/auto'
import { withDefaults, type BattleAction, type GameState } from '@shared/pokemon/game'
import type { Dir } from '@shared/pokemon/map'
import { isBall, type BallId } from '@shared/pokemon/items'
import type { RegionId } from '@shared/pokemon/regions'
import type { PokemonScreen } from '@/store/pokemon'
import { get, requireSocket, set, type AppSocket } from '../core'

const normalized = (game: GameState | null) => game && withDefaults(game)

function addListing(listing: MarketListing): void {
  const listings = get().pokemonListings
  if (!listings.some((l) => l.id === listing.id)) set({ pokemonListings: [...listings, listing] })
}

function removeListing(id: string): void {
  set({ pokemonListings: get().pokemonListings.filter((l) => l.id !== id) })
}

export function bindPokemonEvents(s: AppSocket): void {
  s.on('pokemon:state', (game) => set({ pokemonGame: withDefaults(game) }))
  s.on('pokemon:listing-added', addListing)
  s.on('pokemon:listing-removed', ({ id }) => removeListing(id))
}

async function apply(request: Promise<PokemonResult>): Promise<PokemonResult> {
  set({ pokemonBusy: true })
  try {
    const res = await request
    if (res.ok) set({ pokemonGame: normalized(res.game), pokemonError: null })
    else set({ pokemonError: res.error })
    return res
  } finally {
    set({ pokemonBusy: false })
  }
}

const act = (action: PokemonAction) => apply(requireSocket().emitWithAck('pokemon:act', action))

export async function showPokemon(): Promise<void> {
  const firstTime = !get().pokemonLoaded
  set({ section: 'pokemon' })
  if (firstTime) {
    const saved = loadAutoSettings()
    if (saved) set({ pokemonAuto: saved })
    syncAutoLoop()
  }
  if (get().pokemonBusy) return
  const res = await requireSocket().emitWithAck('pokemon:get')
  if (res.ok) set({ pokemonGame: normalized(res.game), pokemonLoaded: true })
  else set({ pokemonError: res.error })
}

export function openPokemonScreen(screen: PokemonScreen): void {
  set({ pokemonScreen: get().pokemonScreen === screen ? 'map' : screen })
}

export async function chooseStarter(starter: number, look: string): Promise<void> {
  await act({ type: 'start', starter, look })
}

export async function walk(dir: Dir): Promise<void> {
  const { pokemonGame, pokemonBusy, pokemonScreen } = get()
  if (!pokemonGame || pokemonGame.battle || pokemonBusy || pokemonScreen !== 'map') return
  await step(dir)
}

async function step(dir: Dir): Promise<void> {
  const res = await act({ type: 'walk', dir })
  if (!res.ok) return
  set({ pokemonNotice: res.tile === 'counter' ? 'Sua equipe foi curada!' : null })
}

const AUTO_KEY = 'concord:pokemon-auto'
const AUTO_TICK_MS = 400
let autoTimer: ReturnType<typeof setInterval> | null = null

function loadAutoSettings(): AutoSettings | null {
  try {
    const raw = localStorage.getItem(AUTO_KEY)
    return raw ? (JSON.parse(raw) as AutoSettings) : null
  } catch {
    return null
  }
}

function saveAutoSettings(settings: AutoSettings): void {
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify(settings))
  } catch {
    return
  }
}

async function autoTick(): Promise<void> {
  const { pokemonGame, pokemonBusy, pokemonAuto } = get()
  if (!pokemonGame || pokemonBusy) return
  const action = autoAction(pokemonGame, pokemonAuto, Math.random)
  if (!action) return
  if (action.type === 'walk') await step(action.dir)
  else if (action.type === 'battle') await battleAction(action.action)
  else await act(action)
}

function syncAutoLoop(): void {
  const on = get().pokemonAuto.fight
  if (on && !autoTimer) autoTimer = setInterval(() => void autoTick().catch(() => undefined), AUTO_TICK_MS)
  if (!on && autoTimer) {
    clearInterval(autoTimer)
    autoTimer = null
  }
}

export function setAutoSettings(patch: Partial<AutoSettings>): void {
  const next = { ...get().pokemonAuto, ...patch }
  const settings = { ...next, catch: next.fight && next.catch }
  set({ pokemonAuto: settings })
  saveAutoSettings(settings)
  syncAutoLoop()
}

export const BALL_SHAKE_MS = 1500
export const BALL_REVEAL_MS = 1000
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function throwBall(ball: BallId): Promise<PokemonResult> {
  set({ pokemonBusy: true, pokemonThrow: { ball, result: 'shaking' } })
  try {
    const [res] = await Promise.all([requireSocket().emitWithAck('pokemon:act', { type: 'battle', action: { kind: 'item', item: ball } }), wait(BALL_SHAKE_MS)])
    if (!res.ok) {
      set({ pokemonError: res.error })
      return res
    }
    const game = normalized(res.game)
    set({ pokemonGame: game, pokemonError: null, pokemonThrow: { ball, result: game?.battle?.outcome === 'caught' ? 'caught' : 'escaped' } })
    await wait(BALL_REVEAL_MS)
    return res
  } finally {
    set({ pokemonBusy: false, pokemonThrow: null })
  }
}

export const HIT_MS = 700

async function playTurn(action: BattleAction): Promise<PokemonResult> {
  set({ pokemonBusy: true })
  try {
    const res = await requireSocket().emitWithAck('pokemon:act', { type: 'battle', action })
    if (!res.ok) {
      set({ pokemonError: res.error })
      return res
    }
    const game = normalized(res.game)
    for (const [seq, hit] of (game?.battle?.hits ?? []).entries()) {
      set({ pokemonHit: { ...hit, seq } })
      await wait(HIT_MS)
    }
    set({ pokemonGame: game, pokemonError: null })
    return res
  } finally {
    set({ pokemonBusy: false, pokemonHit: null })
  }
}

export const battleAction = (action: BattleAction) => (action.kind === 'item' && isBall(action.item) ? throwBall(action.item) : playTurn(action))
export const leaveBattle = () => act({ type: 'leave-battle' })
export const travelTo = (region: RegionId) => act({ type: 'travel', region })
export const huntPokemon = (region: RegionId, hunt: number) => act({ type: 'travel', region, hunt })

export async function loadDex(region: RegionId): Promise<void> {
  const res = await requireSocket().emitWithAck('pokemon:dex', region)
  if (res.ok) set({ pokemonDex: { ...get().pokemonDex, [region]: res.entries } })
  else set({ pokemonError: res.error })
}
export const evolvePokemon = (uid: string) => act({ type: 'evolve', uid })
export const enterCenter = () => act({ type: 'enter-center' })
export const depositPokemon = (uid: string) => act({ type: 'deposit', uid })
export const withdrawPokemon = (uid: string) => act({ type: 'withdraw', uid })
export const buyPokemonItem = (item: string, quantity: number) => act({ type: 'buy', item, quantity })
export const holdPokemonItem = (uid: string, item: string | null) => act({ type: 'hold', uid, item })
export const setPokemonMoves = (uid: string, moves: string[]) => act({ type: 'set-moves', uid, moves })

export async function loadListings(): Promise<void> {
  const res = await requireSocket().emitWithAck('pokemon:listings')
  if (res.ok) set({ pokemonListings: res.listings })
  else set({ pokemonError: res.error })
}

export const sellOnMarket = (request: SellRequest) => apply(requireSocket().emitWithAck('pokemon:sell', request))
export const buyListing = (id: string) => apply(requireSocket().emitWithAck('pokemon:buy-listing', id))
export const cancelListing = (id: string) => apply(requireSocket().emitWithAck('pokemon:cancel-listing', id))
