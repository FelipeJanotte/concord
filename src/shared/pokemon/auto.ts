import type { PokemonAction } from '../types/pokemon'
import { isFainted, maxHp, movesOf, type GameState, type Mon, type Move } from './game'
import type { BallId } from './items'
import { mapOf, step, type Dir } from './map'
import { effectiveness } from './types'

export interface AutoSettings {
  fight: boolean
  catch: boolean
  balls: BallId[]
}

export const CATCH_BELOW = 0.1
const GRASS_PREFERENCE = 0.8
const SAME_TYPE_BONUS = 1.5
const DIRS: Dir[] = ['up', 'right', 'down', 'left']

const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)]

function strongestMove(mon: Mon, target: Mon): number {
  const score = (m: Move) => m.power * (mon.species.types.includes(m.type) ? SAME_TYPE_BONUS : 1) * effectiveness(m.type, target.species.types)
  const moves = movesOf(mon)
  return moves.reduce((best, m, i) => (score(m) > score(moves[best]) ? i : best), 0)
}

function battleAction(game: GameState, settings: AutoSettings): PokemonAction {
  const battle = game.battle!
  const ball = settings.catch ? settings.balls.find((b) => (game.bag[b] ?? 0) > 0) : undefined
  if (battle.outcome) return battle.lastChance && ball ? { type: 'battle', action: { kind: 'item', item: ball } } : { type: 'leave-battle' }
  if (battle.mustSwitch) {
    const next = game.team.find((m) => !isFainted(m) && m.uid !== battle.activeUid)!
    return { type: 'battle', action: { kind: 'switch', uid: next.uid } }
  }
  const weak = battle.wild.hp / maxHp(battle.wild) < CATCH_BELOW
  if (ball && weak) return { type: 'battle', action: { kind: 'item', item: ball } }
  const active = game.team.find((m) => m.uid === battle.activeUid)!
  return { type: 'battle', action: { kind: 'fight', move: strongestMove(active, battle.wild) } }
}

function walkAction(game: GameState, rng: () => number): PokemonAction | null {
  const moves = DIRS.map((dir) => ({ dir, to: step(mapOf(game), game.pos, dir) })).filter(({ to }) => to.pos !== game.pos)
  if (moves.length === 0) return null
  const grass = moves.filter(({ to }) => to.tile === 'grass')
  const choice = grass.length && rng() < GRASS_PREFERENCE ? pick(grass, rng) : pick(moves, rng)
  return { type: 'walk', dir: choice.dir }
}

export function autoAction(game: GameState, settings: AutoSettings, rng: () => number): PokemonAction | null {
  if (!settings.fight) return null
  if (game.battle) return battleAction(game, settings)
  if (game.place === 'center') return game.hunt === null ? { type: 'travel', region: game.region } : { type: 'travel', region: game.region, hunt: game.hunt }
  return walkAction(game, rng)
}
