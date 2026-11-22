export type ItemCategory = 'ball' | 'potion' | 'revive' | 'hold' | 'stone'

export const BALLS = {
  pokeball: { label: 'Poké Ball', price: 200, rate: 1 },
  greatball: { label: 'Great Ball', price: 600, rate: 2 },
  ultraball: { label: 'Ultra Ball', price: 1200, rate: 5 },
  beastball: { label: 'Beast Ball', price: 3000, rate: 10 }
} as const

export const POTIONS = {
  potion: { label: 'Poção', price: 300, share: 0.1 },
  'super-potion': { label: 'Super Poção', price: 700, share: 0.3 },
  'hyper-potion': { label: 'Hiper Poção', price: 1500, share: 0.6 },
  'max-potion': { label: 'Poção Máxima', price: 2500, share: 1 }
} as const

export const REVIVES = {
  revive: { label: 'Revive', price: 1500, share: 0.3 },
  'max-revive': { label: 'Max Revive', price: 4000, share: 1 }
} as const

export const HOLD_ITEMS = {
  leftovers: { label: 'Leftovers', price: 4000, description: 'Recupera 1/16 do HP no fim de cada turno' },
  charcoal: { label: 'Charcoal', price: 3000, description: 'Golpes de Fogo causam 20% a mais' },
  'mystic-water': { label: 'Mystic Water', price: 3000, description: 'Golpes de Água causam 20% a mais' },
  'miracle-seed': { label: 'Miracle Seed', price: 3000, description: 'Golpes de Planta causam 20% a mais' },
  magnet: { label: 'Magnet', price: 3000, description: 'Golpes Elétricos causam 20% a mais' },
  'quick-claw': { label: 'Quick Claw', price: 4000, description: '20% de chance de atacar primeiro' },
  'choice-band': { label: 'Choice Band', price: 8000, description: 'Todos os golpes causam 50% a mais' },
  'lucky-egg': { label: 'Lucky Egg', price: 10000, description: 'Ganha 50% a mais de XP' }
} as const

export type BallId = keyof typeof BALLS
export type PotionId = keyof typeof POTIONS
export type ReviveId = keyof typeof REVIVES
export type HoldItemId = keyof typeof HOLD_ITEMS

export const TYPE_BOOSTERS: Partial<Record<HoldItemId, string>> = {
  charcoal: 'fire',
  'mystic-water': 'water',
  'miracle-seed': 'grass',
  magnet: 'electric'
}

export const TYPE_LABELS: Record<string, string> = {
  normal: 'Normal',
  fire: 'Fogo',
  water: 'Água',
  grass: 'Planta',
  electric: 'Elétrico',
  ice: 'Gelo',
  fighting: 'Lutador',
  poison: 'Venenoso',
  ground: 'Terra',
  flying: 'Voador',
  psychic: 'Psíquico',
  bug: 'Inseto',
  rock: 'Pedra',
  ghost: 'Fantasma',
  dragon: 'Dragão',
  dark: 'Sombrio',
  steel: 'Aço',
  fairy: 'Fada'
}

const STONE_PREFIX = 'stone-'

const STONE_NAMES: Record<string, string> = {
  normal: 'Pedra do Sol',
  fire: 'Pedra de Fogo',
  water: "Pedra d'Água",
  electric: 'Pedra do Trovão',
  grass: 'Pedra da Folha',
  ice: 'Pedra de Gelo',
  fighting: 'Pedra Soco',
  poison: 'Pedra do Crepúsculo',
  ground: 'Pedra Terra',
  flying: 'Pedra Pena',
  psychic: 'Pedra Brilhante',
  bug: 'Pedra Casulo',
  rock: 'Pedra Rocha',
  ghost: 'Pedra das Trevas',
  dragon: 'Pedra Ancestral',
  steel: 'Pedra Metálica',
  fairy: 'Pedra Coração'
}
const SHARED_STONE: Record<string, string> = { dark: 'ghost' }

export const stoneId = (type: string) => `${STONE_PREFIX}${SHARED_STONE[type] ?? type}`
export const stoneType = (id: string) => (id.startsWith(STONE_PREFIX) ? id.slice(STONE_PREFIX.length) : null)
export const stoneTypes = (id: string) => {
  const type = stoneType(id)
  return type ? [type, ...Object.keys(SHARED_STONE).filter((t) => SHARED_STONE[t] === type)].map((t) => TYPE_LABELS[t]) : []
}

export const isBall = (id: string): id is BallId => Object.hasOwn(BALLS, id)
const isPotion = (id: string): id is PotionId => Object.hasOwn(POTIONS, id)
export const isRevive = (id: string): id is ReviveId => Object.hasOwn(REVIVES, id)
export const isHoldItem = (id: string): id is HoldItemId => Object.hasOwn(HOLD_ITEMS, id)

export function itemCategory(id: string): ItemCategory | null {
  if (isBall(id)) return 'ball'
  if (isPotion(id)) return 'potion'
  if (isRevive(id)) return 'revive'
  if (isHoldItem(id)) return 'hold'
  const type = stoneType(id)
  return type !== null && Object.hasOwn(STONE_NAMES, type) ? 'stone' : null
}

export function itemLabel(id: string): string {
  if (isBall(id)) return BALLS[id].label
  if (isPotion(id)) return POTIONS[id].label
  if (isRevive(id)) return REVIVES[id].label
  if (isHoldItem(id)) return HOLD_ITEMS[id].label
  const type = stoneType(id)
  return (type && STONE_NAMES[type]) || id
}

const hpShare = (share: number) => (share === 1 ? 'todo o HP' : `${Math.round(share * 100)}% do HP`)

export function itemDescription(id: string): string | null {
  if (isBall(id)) return `Taxa de captura ${BALLS[id].rate}x`
  if (isPotion(id)) return `Recupera ${hpShare(POTIONS[id].share)}`
  if (isRevive(id)) return `Revive um pokémon desmaiado com ${hpShare(REVIVES[id].share)}`
  if (isHoldItem(id)) return HOLD_ITEMS[id].description
  return null
}

export function itemPrice(id: string): number | null {
  if (isBall(id)) return BALLS[id].price
  if (isPotion(id)) return POTIONS[id].price
  if (isRevive(id)) return REVIVES[id].price
  if (isHoldItem(id)) return HOLD_ITEMS[id].price
  return null
}

export const MARKET: Record<'ball' | 'potion' | 'hold', string[]> = {
  ball: Object.keys(BALLS),
  potion: [...Object.keys(POTIONS), ...Object.keys(REVIVES)],
  hold: Object.keys(HOLD_ITEMS)
}
