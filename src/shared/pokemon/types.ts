export const POKEMON_TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy'
] as const

export type PokemonType = (typeof POKEMON_TYPES)[number]

interface Matchup {
  double?: PokemonType[]
  half?: PokemonType[]
  none?: PokemonType[]
}

const CHART: Record<PokemonType, Matchup> = {
  normal: { half: ['rock', 'steel'], none: ['ghost'] },
  fire: { double: ['grass', 'ice', 'bug', 'steel'], half: ['fire', 'water', 'rock', 'dragon'] },
  water: { double: ['fire', 'ground', 'rock'], half: ['water', 'grass', 'dragon'] },
  electric: { double: ['water', 'flying'], half: ['electric', 'grass', 'dragon'], none: ['ground'] },
  grass: { double: ['water', 'ground', 'rock'], half: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'] },
  ice: { double: ['grass', 'ground', 'flying', 'dragon'], half: ['fire', 'water', 'ice', 'steel'] },
  fighting: { double: ['normal', 'ice', 'rock', 'dark', 'steel'], half: ['poison', 'flying', 'psychic', 'bug', 'fairy'], none: ['ghost'] },
  poison: { double: ['grass', 'fairy'], half: ['poison', 'ground', 'rock', 'ghost'], none: ['steel'] },
  ground: { double: ['fire', 'electric', 'poison', 'rock', 'steel'], half: ['grass', 'bug'], none: ['flying'] },
  flying: { double: ['grass', 'fighting', 'bug'], half: ['electric', 'rock', 'steel'] },
  psychic: { double: ['fighting', 'poison'], half: ['psychic', 'steel'], none: ['dark'] },
  bug: { double: ['grass', 'psychic', 'dark'], half: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'] },
  rock: { double: ['fire', 'ice', 'flying', 'bug'], half: ['fighting', 'ground', 'steel'] },
  ghost: { double: ['psychic', 'ghost'], half: ['dark'], none: ['normal'] },
  dragon: { double: ['dragon'], half: ['steel'], none: ['fairy'] },
  dark: { double: ['psychic', 'ghost'], half: ['fighting', 'dark', 'fairy'] },
  steel: { double: ['ice', 'rock', 'fairy'], half: ['fire', 'water', 'electric', 'steel'] },
  fairy: { double: ['fighting', 'dragon', 'dark'], half: ['fire', 'poison', 'steel'] }
}

const isType = (type: string): type is PokemonType => (POKEMON_TYPES as readonly string[]).includes(type)

function single(attack: string, defend: string): number {
  if (!isType(attack) || !isType(defend)) return 1
  const m = CHART[attack]
  if (m.none?.includes(defend)) return 0
  if (m.double?.includes(defend)) return 2
  if (m.half?.includes(defend)) return 0.5
  return 1
}

export const effectiveness = (attack: string, defenderTypes: string[]) => defenderTypes.reduce((total, t) => total * single(attack, t), 1)
