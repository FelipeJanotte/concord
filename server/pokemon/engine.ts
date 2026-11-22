import type { PokemonAction } from '../../src/shared/types'
import {
  battleTurn,
  buyItem,
  createMon,
  depositMon,
  endBattle,
  evolveMon,
  evolveTarget,
  healTeam,
  holdItem,
  setMoves,
  isRefusal,
  leadMon,
  newGame,
  refuse,
  startBattle,
  STARTER_LEVEL,
  STARTERS,
  withdrawMon,
  type BattleAction,
  type GameState,
  type Refusal,
  type Species,
  type Step
} from '../../src/shared/pokemon/game'
import { CENTER_SPAWN, ENCOUNTER_RATE, hasBiomeMap, mapOf, START, step, type Dir, type Tile } from '../../src/shared/pokemon/map'
import { huntRefusal, isRegionId, isRegionUnlocked, unlockLevel, wildEncounter, type HuntInfo, type RegionId } from '../../src/shared/pokemon/regions'
import { randomNature } from '../../src/shared/pokemon/natures'
import { isTrainerLook } from '../../src/shared/pokemon/trainers'

export interface EngineDeps {
  species: (id: number) => Promise<Species>
  huntInfo: (id: number) => Promise<HuntInfo>
  rng: () => number
  uid: () => string
}

export type EngineResult = { game: GameState; tile?: Tile } | Refusal

const DIRS: Dir[] = ['up', 'down', 'left', 'right']
const isString = (value: unknown): value is string => typeof value === 'string'

export function parseAction(raw: unknown): PokemonAction | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  switch (a.type) {
    case 'start':
      return typeof a.starter === 'number' && isString(a.look) ? { type: 'start', starter: a.starter, look: a.look } : null
    case 'walk':
      return DIRS.includes(a.dir as Dir) ? { type: 'walk', dir: a.dir as Dir } : null
    case 'battle': {
      const action = parseBattleAction(a.action)
      return action ? { type: 'battle', action } : null
    }
    case 'leave-battle':
    case 'enter-center':
      return { type: a.type }
    case 'travel':
      if (!isRegionId(a.region)) return null
      if (a.hunt === undefined) return { type: 'travel', region: a.region }
      return Number.isInteger(a.hunt) ? { type: 'travel', region: a.region, hunt: a.hunt as number } : null
    case 'evolve':
    case 'deposit':
    case 'withdraw':
      return isString(a.uid) ? { type: a.type, uid: a.uid } : null
    case 'buy':
      return isString(a.item) && typeof a.quantity === 'number' ? { type: 'buy', item: a.item, quantity: a.quantity } : null
    case 'hold':
      return isString(a.uid) && (a.item === null || isString(a.item)) ? { type: 'hold', uid: a.uid, item: a.item } : null
    case 'set-moves':
      return isString(a.uid) && Array.isArray(a.moves) && a.moves.every(isString) ? { type: 'set-moves', uid: a.uid, moves: a.moves } : null
    default:
      return null
  }
}

function parseBattleAction(raw: unknown): BattleAction | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (a.kind === 'fight' && Number.isInteger(a.move)) return { kind: 'fight', move: a.move as number }
  if (a.kind === 'item' && isString(a.item) && a.target === undefined) return { kind: 'item', item: a.item }
  if (a.kind === 'item' && isString(a.item) && isString(a.target)) return { kind: 'item', item: a.item, target: a.target }
  if (a.kind === 'switch' && isString(a.uid)) return { kind: 'switch', uid: a.uid }
  if (a.kind === 'run') return { kind: 'run' }
  return null
}

const done = (next: Step, tile?: Tile): EngineResult => (isRefusal(next) ? next : { game: next, tile })

export async function runAction(game: GameState | null, action: PokemonAction, deps: EngineDeps): Promise<EngineResult> {
  if (action.type === 'start') {
    if (game) return refuse('Você já começou o jogo')
    if (!STARTERS.includes(action.starter)) return refuse('Escolha um dos pokémon iniciais')
    if (!isTrainerLook(action.look)) return refuse('Escolha um dos treinadores')
    return { game: newGame(createMon(await deps.species(action.starter), STARTER_LEVEL, deps.uid(), randomNature(deps.rng)), action.look) }
  }
  if (!game) return refuse('Escolha seu primeiro pokémon')
  switch (action.type) {
    case 'walk':
      return walk(game, action.dir, deps)
    case 'battle':
      return done(battleTurn(game, action.action, deps.rng))
    case 'leave-battle':
      return done(endBattle(game))
    case 'travel':
      if (game.battle) return refuse('Termine a batalha primeiro')
      if (!isRegionUnlocked(action.region, game.trainer.level)) return refuse(`Região liberada no nível ${unlockLevel(action.region)} de treinador`)
      return travel(game, action.region, action.hunt ?? null, deps)
    case 'enter-center':
      if (game.battle) return refuse('Termine a batalha primeiro')
      return { game: { ...game, place: 'center', pos: CENTER_SPAWN, trainer: { ...game.trainer, facing: 'up' } } }
    case 'evolve': {
      const target = evolveTarget(game, action.uid)
      if ('error' in target) return target
      return done(evolveMon(game, action.uid, await deps.species(target.id)))
    }
    case 'deposit':
      return done(depositMon(game, action.uid))
    case 'withdraw':
      return done(withdrawMon(game, action.uid))
    case 'buy':
      return done(buyItem(game, action.item, action.quantity))
    case 'hold':
      return done(holdItem(game, action.uid, action.item))
    case 'set-moves':
      return done(setMoves(game, action.uid, action.moves))
  }
}

async function travel(game: GameState, region: RegionId, hunt: number | null, deps: EngineDeps): Promise<EngineResult> {
  if (hunt === null) return { game: { ...game, place: 'outdoor', pos: START, region, hunt, biome: null } }
  const refused = huntRefusal(region, hunt, await deps.huntInfo(hunt))
  if (refused) return refuse(refused)
  const type = (await deps.species(hunt)).types[0]
  return { game: { ...game, place: 'outdoor', pos: START, region, hunt, biome: hasBiomeMap(type) ? type : null } }
}

async function walk(game: GameState, dir: Dir, deps: EngineDeps): Promise<EngineResult> {
  if (game.battle) return refuse('Termine a batalha primeiro')
  const moved = step(mapOf(game), game.pos, dir)
  const next = { ...game, pos: moved.pos, trainer: { ...game.trainer, facing: dir } }
  if (moved.tile === 'counter') return { game: healTeam(next), tile: moved.tile }
  if (game.place !== 'outdoor' || moved.tile !== 'grass' || deps.rng() >= ENCOUNTER_RATE) return { game: next, tile: moved.tile }
  const { id, level } = wildEncounter(game.region, leadMon(game).level, deps.rng, game.hunt)
  const wild = createMon(await deps.species(id), level, deps.uid(), randomNature(deps.rng))
  return { game: startBattle(next, wild), tile: moved.tile }
}
