import { evolutionLevel, type BaseStats, type Evolution, type Move, type Species } from '../../src/shared/pokemon/game'
import type { DexEntry } from '../../src/shared/types/pokemon'
import { regionById, type HuntInfo, type RegionId } from '../../src/shared/pokemon/regions'

export const POKEAPI_URL = 'https://pokeapi.co/api/v2'
const FALLBACK_MOVE: Move = { name: 'tackle', power: 40, type: 'normal', level: 1, category: 'physical' }

export type FetchJson = (url: string) => Promise<unknown>

interface ApiMoveRef {
  move: { name: string; url: string }
  version_group_details: { level_learned_at: number; move_learn_method: { name: string } }[]
}

interface ApiPokemon {
  id: number
  name: string
  species: { url: string }
  types: { type: { name: string } }[]
  sprites: { front_default: string | null; back_default: string | null }
  stats: { base_stat: number; stat: { name: string } }[]
  moves: ApiMoveRef[]
}

interface ApiChainLink {
  species: { name: string; url: string }
  evolves_to: ApiChainLink[]
}

interface ApiMove {
  name: string
  power: number | null
  type: { name: string }
  damage_class?: { name: string }
}

const cache = new Map<string, Promise<unknown>>()

async function download(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`PokeAPI respondeu ${res.status}`)
  return res.json()
}

export function getJson(url: string): Promise<unknown> {
  const known = cache.get(url)
  if (known) return known
  const pending = download(url)
  cache.set(url, pending)
  pending.catch(() => cache.delete(url))
  return pending
}

export async function fetchSpecies(id: number, fetchJson: FetchJson): Promise<Species> {
  const data = (await fetchJson(`${POKEAPI_URL}/pokemon/${id}`)) as ApiPokemon
  const [moves, evolution] = await Promise.all([damagingMoves(levelUpMoves(data.moves), fetchJson), fetchEvolution(idFromUrl(data.species.url), fetchJson)])
  return {
    id: data.id,
    name: data.name,
    types: data.types.map((t) => t.type.name),
    sprite: data.sprites.front_default ?? '',
    backSprite: data.sprites.back_default ?? data.sprites.front_default ?? '',
    stats: baseStats(data.stats),
    moves: moves.length > 0 ? moves : [FALLBACK_MOVE],
    evolution
  }
}

const idFromUrl = (url: string) => Number(url.split('/').filter(Boolean).pop())

export async function fetchRegionDex(region: RegionId, fetchJson: FetchJson): Promise<DexEntry[]> {
  const { first, last } = regionById(region)
  const data = (await fetchJson(`${POKEAPI_URL}/pokemon-species?offset=${first - 1}&limit=${last - first + 1}`)) as { results: { name: string; url: string }[] }
  const entries = data.results.map((r) => ({ id: idFromUrl(r.url), name: r.name }))
  const infos = await Promise.all(entries.map((e) => fetchHuntInfo(e.id, fetchJson)))
  const huntable = entries.filter((_, i) => infos[i].base && !infos[i].legendary)
  return Promise.all(huntable.map(async (e) => ({ ...e, types: await fetchTypes(e.id, fetchJson) })))
}

async function fetchTypes(id: number, fetchJson: FetchJson): Promise<string[]> {
  const data = (await fetchJson(`${POKEAPI_URL}/pokemon/${id}`)) as Pick<ApiPokemon, 'types'>
  return data.types.map((t) => t.type.name)
}

export async function fetchHuntInfo(id: number, fetchJson: FetchJson): Promise<HuntInfo> {
  const data = (await fetchJson(`${POKEAPI_URL}/pokemon-species/${id}`)) as { evolves_from_species: { url: string } | null; is_legendary: boolean; is_mythical: boolean }
  const from = data.evolves_from_species && idFromUrl(data.evolves_from_species.url)
  return { base: !from || from > id, legendary: data.is_legendary || data.is_mythical }
}

export async function fetchEvolution(speciesId: number, fetchJson: FetchJson): Promise<Evolution | null> {
  const species = (await fetchJson(`${POKEAPI_URL}/pokemon-species/${speciesId}`)) as { evolution_chain: { url: string } | null }
  if (!species.evolution_chain) return null
  const chain = (await fetchJson(species.evolution_chain.url)) as { chain: ApiChainLink }
  const found = findLink(chain.chain, speciesId, 0)
  const next = found?.link.evolves_to[0]
  if (!found || !next) return null
  return { id: idFromUrl(next.species.url), level: evolutionLevel(found.depth), name: next.species.name }
}

function findLink(link: ApiChainLink, speciesId: number, depth: number): { link: ApiChainLink; depth: number } | null {
  if (idFromUrl(link.species.url) === speciesId) return { link, depth }
  for (const child of link.evolves_to) {
    const found = findLink(child, speciesId, depth + 1)
    if (found) return found
  }
  return null
}

function levelUpMoves(moves: ApiMoveRef[]): { ref: ApiMoveRef; level: number }[] {
  return moves
    .map((ref) => ({ ref, levels: ref.version_group_details.filter((d) => d.move_learn_method.name === 'level-up').map((d) => d.level_learned_at) }))
    .filter(({ levels }) => levels.length > 0)
    .map(({ ref, levels }) => ({ ref, level: Math.max(1, Math.min(...levels)) }))
    .sort((a, b) => a.level - b.level)
}

async function damagingMoves(learned: { ref: ApiMoveRef; level: number }[], fetchJson: FetchJson): Promise<Move[]> {
  const details = await Promise.all(learned.map(({ ref }) => fetchJson(ref.move.url) as Promise<ApiMove>))
  return learned.flatMap(({ level }, i) => {
    const move = details[i]
    return move.power ? [{ name: move.name, power: move.power, type: move.type.name, level, category: move.damage_class?.name === 'special' ? ('special' as const) : ('physical' as const) }] : []
  })
}

function baseStats(stats: ApiPokemon['stats']): BaseStats {
  const of = (name: string) => stats.find((s) => s.stat.name === name)?.base_stat ?? 1
  return { hp: of('hp'), attack: of('attack'), defense: of('defense'), spAttack: of('special-attack'), spDefense: of('special-defense'), speed: of('speed') }
}
