import type { BaseStats } from './game'

export type NatureStat = Exclude<keyof BaseStats, 'hp'>

export interface Nature {
  up?: NatureStat
  down?: NatureStat
}

export const NATURES: Record<string, Nature> = {
  hardy: {},
  lonely: { up: 'attack', down: 'defense' },
  brave: { up: 'attack', down: 'speed' },
  adamant: { up: 'attack', down: 'spAttack' },
  naughty: { up: 'attack', down: 'spDefense' },
  bold: { up: 'defense', down: 'attack' },
  docile: {},
  relaxed: { up: 'defense', down: 'speed' },
  impish: { up: 'defense', down: 'spAttack' },
  lax: { up: 'defense', down: 'spDefense' },
  timid: { up: 'speed', down: 'attack' },
  hasty: { up: 'speed', down: 'defense' },
  serious: {},
  jolly: { up: 'speed', down: 'spAttack' },
  naive: { up: 'speed', down: 'spDefense' },
  modest: { up: 'spAttack', down: 'attack' },
  mild: { up: 'spAttack', down: 'defense' },
  quiet: { up: 'spAttack', down: 'speed' },
  bashful: {},
  rash: { up: 'spAttack', down: 'spDefense' },
  calm: { up: 'spDefense', down: 'attack' },
  gentle: { up: 'spDefense', down: 'defense' },
  sassy: { up: 'spDefense', down: 'speed' },
  careful: { up: 'spDefense', down: 'spAttack' },
  quirky: {}
}

export const NEUTRAL_NATURE = 'hardy'
const BOOST = 1.1
const DROP = 0.9
const NAMES = Object.keys(NATURES)

export const randomNature = (rng: () => number) => NAMES[Math.floor(rng() * NAMES.length)]

export function natureFactor(nature: string, stat: NatureStat): number {
  const n = NATURES[nature] ?? {}
  if (n.up === stat) return BOOST
  if (n.down === stat) return DROP
  return 1
}
