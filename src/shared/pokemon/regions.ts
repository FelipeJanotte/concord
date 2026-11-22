export type RegionId = 'kanto' | 'johto' | 'hoenn' | 'sinnoh' | 'unova' | 'kalos' | 'alola' | 'galar' | 'paldea'

export interface Region {
  id: RegionId
  label: string
  first: number
  last: number
}

export const REGIONS: Region[] = [
  { id: 'kanto', label: 'Kanto', first: 1, last: 151 },
  { id: 'johto', label: 'Johto', first: 152, last: 251 },
  { id: 'hoenn', label: 'Hoenn', first: 252, last: 386 },
  { id: 'sinnoh', label: 'Sinnoh', first: 387, last: 493 },
  { id: 'unova', label: 'Unova', first: 494, last: 649 },
  { id: 'kalos', label: 'Kalos', first: 650, last: 721 },
  { id: 'alola', label: 'Alola', first: 722, last: 809 },
  { id: 'galar', label: 'Galar', first: 810, last: 905 },
  { id: 'paldea', label: 'Paldea', first: 906, last: 1025 }
]

export const DEFAULT_REGION: RegionId = 'kanto'
export const REGION_UNLOCK_STEP = 100
export const MIN_WILD_LEVEL = 2
const WILD_LOW = 0.8
const WILD_HIGH = 1.2
const REGION_DIFFICULTY = 0.1

export const isRegionId = (id: unknown): id is RegionId => REGIONS.some((r) => r.id === id)
export const regionIndex = (id: RegionId) => REGIONS.findIndex((r) => r.id === id)
export const regionById = (id: RegionId): Region => REGIONS[regionIndex(id)] ?? REGIONS[0]
export const unlockLevel = (id: RegionId) => regionIndex(id) * REGION_UNLOCK_STEP
export const isRegionUnlocked = (id: RegionId, trainerLevel: number) => trainerLevel >= unlockLevel(id)

export function wildLevelRange(leadLevel: number, region: RegionId): { min: number; max: number } {
  const factor = 1 + REGION_DIFFICULTY * regionIndex(region)
  const min = Math.max(MIN_WILD_LEVEL, Math.floor(leadLevel * WILD_LOW * factor))
  const max = Math.max(min, Math.ceil(leadLevel * WILD_HIGH * factor))
  return { min, max }
}

export interface HuntInfo {
  base: boolean
  legendary: boolean
}

export const inRegion = (region: RegionId, id: number) => id >= regionById(region).first && id <= regionById(region).last

export function huntRefusal(region: RegionId, id: number, info: HuntInfo): string | null {
  if (!inRegion(region, id)) return `Esse pokémon não é de ${regionById(region).label}`
  if (info.legendary) return 'Lendários e míticos não podem ser caçados'
  if (!info.base) return 'Só a primeira forma do pokémon pode ser caçada'
  return null
}

export function wildEncounter(region: RegionId, leadLevel: number, rng: () => number, hunt: number | null = null): { id: number; level: number } {
  const { first, last } = regionById(region)
  const { min, max } = wildLevelRange(leadLevel, region)
  const id = hunt ?? first + Math.floor(rng() * (last - first + 1))
  return { id, level: min + Math.floor(rng() * (max - min + 1)) }
}
