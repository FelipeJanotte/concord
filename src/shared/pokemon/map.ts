import type { RegionId } from './regions'
import type { PokemonType } from './types'

export type Place = 'outdoor' | 'center'
export type MapId = 'field' | 'center' | PokemonType | RegionId
export type Tile = 'tree' | 'path' | 'grass' | 'water' | 'building' | 'wall' | 'floor' | 'counter' | 'table' | 'plant'
export type Dir = 'up' | 'down' | 'left' | 'right'
export interface Pos {
  x: number
  y: number
}

const FIELD = [
  'TTTTTTTTTTTTTTTT',
  'T..............T',
  'T..............T',
  'T..............T',
  'T.GGGG...GGGGG.T',
  'T.GGGG...GGGGG.T',
  'T.GGGG...GGGGG.T',
  'T..............T',
  'T.....GGGGG....T',
  'T.....GGGGG....T',
  'T..............T',
  'TTTTTTTTTTTTTTTT'
]

const CENTER = [
  'WWWWWWWWWWWW',
  'WPFKKKKKKFPW',
  'WFFFFFFFFFFW',
  'WFFFFFFFFFFW',
  'WBBFFFFFFBBW',
  'WBBFFFFFFBBW',
  'WFFFFFFFFFFW',
  'WFFFFMMFFFFW',
  'WWWWWWWWWWWW'
]

export const BIOME_MAPS: Partial<Record<PokemonType, string[]>> = {
  fire: ['TTTTTTTTTTTTTTTT', 'T....TT....GG..T', 'T.GG.TT.GG.GG..T', 'T.GG....GG.....T', 'T......TTT..GG.T', 'TTT.GG.TTT..GG.T', 'T...GG......TT.T', 'T.......GGG....T', 'T.TT....GGG..G.T', 'T.TT.GG......GGT', 'T....GG........T', 'TTTTTTTTTTTTTTTT'],
  water: ['TTTTTTTTTTTTTTTT', 'T.G..G...T..G..T', 'T.G..G..TT..G..T', 'T.G..G.......G.T', 'T......TT....G.T', 'T.GGG..TT.G....T', 'T......T..G..T.T', 'T.T..G....G..TTT', 'T.T..G..G......T', 'T....G..G...G..T', 'T.......G...G..T', 'TTTTTTTTTTTTTTTT'],
  electric: ['TTTTTTTTTTTTTTTT', 'T..............T', 'T.TT.TT.TT.TT..T', 'T.TT.TT.TT.TT..T', 'T.GG.GG.GG.GG..T', 'T..............T', 'T.GGG......GGG.T', 'T.TTT..GG..TTT.T', 'T.TTT..GG..TTT.T', 'T..............T', 'T..GG..........T', 'TTTTTTTTTTTTTTTT'],
  grass: ['TTTTTTTTTTTTTTTT', 'T.GG.T..T.GG...T', 'T.GG...TT.GG.T.T', 'T....T......TT.T', 'TT.GG..GGG.....T', 'T..GG.TGGG.T.GGT', 'T.T....GGG...GGT', 'T...T.......T..T', 'T.GG..TT.GG....T', 'T.GG.....GG.TT.T', 'T.....T........T', 'TTTTTTTTTTTTTTTT'],
  ice: ['TTTTTTTTTTTTTTTT', 'TTT.....GGGG..TT', 'T...GGG.GGGG...T', 'T...GGG......T.T', 'T.TT.....TT..T.T', 'T.TT.GGG.TT....T', 'T....GGG....GG.T', 'T..........GGG.T', 'T.GGGG.TT..GGG.T', 'T.GGGG.TT......T', 'TT.............T', 'TTTTTTTTTTTTTTTT'],
  fighting: ['TTTTTTTTTTTTTTTT', 'T.T.T.T..T.T.T.T', 'T..............T', 'T.GGGG....GGGG.T', 'T.GGGG....GGGG.T', 'T.GGGG....GGGG.T', 'T..............T', 'T.TT..GGGG..TT.T', 'T.TT..GGGG..TT.T', 'T..............T', 'T.T.T......T.T.T', 'TTTTTTTTTTTTTTTT'],
  poison: ['TTTTTTTTTTTTTTTT', 'T..GG.....T....T', 'T.GGGG..T....GGT', 'T..GG.......GGGT', 'T.T....GG....G.T', 'T....TGGGG.T...T', 'T.GG...GG......T', 'TGGG.T....T.GG.T', 'T.G.....GG..GG.T', 'T...TT..GG.....T', 'T.T............T', 'TTTTTTTTTTTTTTTT'],
  ground: ['TTTTTTTTTTTTTTTT', 'T....TTTTT.....T', 'T.GG..TTT..GGG.T', 'T.GG...T...GGG.T', 'TT............TT', 'TTT..GGGGGG..TTT', 'TT...GGGGGG...TT', 'T......TT......T', 'T.GGG..TT..GGG.T', 'T.GGG......GGG.T', 'TT............TT', 'TTTTTTTTTTTTTTTT'],
  rock: ['TTTTTTTTTTTTTTTT', 'TT..GGG..T.GGG.T', 'T...GGG.TT.GGG.T', 'T.T......T.....T', 'T.TT.GG.....T..T', 'T....GG.GGG.TT.T', 'TT......GGG....T', 'T..GGG.T.....GGT', 'T..GGG.TT.T..GGT', 'T.......T......T', 'T.TT...........T', 'TTTTTTTTTTTTTTTT'],
  flying: ['TTTTTTTTTTTTTTTT', 'T......TT......T', 'T.GGG..TT..GGG.T', 'T.GGG......GGG.T', 'T....T....T....T', 'TT..GGG..GGG..TT', 'TT..GGG..GGG..TT', 'T....T....T....T', 'T.GG...TT...GG.T', 'T.GG...TT...GG.T', 'T..............T', 'TTTTTTTTTTTTTTTT'],
  psychic: ['TTTTTTTTTTTTTTTT', 'T.T..T....T..T.T', 'T..............T', 'T.T.GG.TT.GG.T.T', 'T...GG.TT.GG...T', 'T.T..........T.T', 'T....GGGGGG....T', 'T.T..GGGGGG..T.T', 'T..............T', 'T.T.GG....GG.T.T', 'T...GG....GG...T', 'TTTTTTTTTTTTTTTT'],
  bug: ['TTTTTTTTTTTTTTTT', 'T..T...GG..T...T', 'T.GGG..GG.....TT', 'T.GGG.T...GGG..T', 'T.....T...GGG..T', 'TT..T....T.....T', 'T..GGGG.....T..T', 'T..GGGG..T.GGG.T', 'T.T.......TGGG.T', 'T....GG.T......T', 'T.T..GG........T', 'TTTTTTTTTTTTTTTT'],
  ghost: ['TTTTTTTTTTTTTTTT', 'T..............T', 'T.T.T.T..T.T.T.T', 'T.GGGGG..GGGGG.T', 'T.T.T.T..T.T.T.T', 'T..............T', 'T.GG.T....T.GG.T', 'T.GG.T.GG.T.GG.T', 'T......GG......T', 'T.T.T......T.T.T', 'T.GG...........T', 'TTTTTTTTTTTTTTTT'],
  dragon: ['TTTTTTTTTTTTTTTT', 'TTT...GGG...TTTT', 'TT..T.GGG.T...TT', 'T....T...T.....T', 'T.GG.......GG..T', 'T.GG.TT.TT.GG..T', 'T....TT.TT.....T', 'TT...........TTT', 'T..GGG.T.GGG...T', 'T..GGG.T.GGG...T', 'TT.............T', 'TTTTTTTTTTTTTTTT'],
  dark: ['TTTTTTTTTTTTTTTT', 'T....TTT..TTT..T', 'T.GG.TTT..TTT..T', 'T.GG......GG...T', 'T....TT...GG.T.T', 'TTT..TT......T.T', 'T....GG..TTT...T', 'T.TT.GG..TTT.GGT', 'T.TT.......GG..T', 'T....TTT.......T', 'T.GG.TT........T', 'TTTTTTTTTTTTTTTT'],
  steel: ['TTTTTTTTTTTTTTTT', 'T.TT..TT..TT...T', 'T.TT..TT..TT.G.T', 'T....GGG.....G.T', 'T.GG.GGG.TTT...T', 'T.GG.....TTT...T', 'T....TT......GGT', 'TTT..TT..GG..GGT', 'T........GG....T', 'T.TTT..........T', 'T.TTT...GGG....T', 'TTTTTTTTTTTTTTTT'],
  fairy: ['TTTTTTTTTTTTTTTT', 'T..............T', 'T.GG.TT..TT.GG.T', 'T.GG.T....T.GG.T', 'T....T.GG.T....T', 'TT.....GG.....TT', 'T..GG......GG..T', 'T..GG.TTTT.GG..T', 'T......TT......T', 'T.GGG......GGG.T', 'T.GGG..........T', 'TTTTTTTTTTTTTTTT']
}

export const REGION_MAPS: Record<RegionId, string[]> = {
  kanto: ['TTTTTTTTTTTTTTTT', 'TAAAAAAA..HHH..T', 'TAAAAAAA..HHH..T', 'TAA......AAA...T', 'T....HH..AAA.GGT', 'T.GG.HH......GGT', 'T.GG.....HHH...T', 'TAA..GG..HHH.TTT', 'TAA..GG........T', 'T.......HH..GG.T', 'T.TT....HH..GG.T', 'TTTTTTTTTTTTTTTT'],
  johto: ['TTTTTTTTTTTTTTTT', 'TT..AAAAAAA...TT', 'T...AAAAAAA....T', 'T.....HHHH.....T', 'T.GG..HHHH..GG.T', 'T.GG........GG.T', 'TT....TTT......T', 'T..HH.TTT.HH...T', 'T..HH.....HH.GGT', 'T.GG.......GGGGT', 'T.GG...........T', 'TTTTTTTTTTTTTTTT'],
  hoenn: ['TTTTTTTTTTTTTTTT', 'TAAAA..HHHH....T', 'TAAAA..HHHH.HH.T', 'TAAA.......HH..T', 'TAA..HHH.......T', 'TAA..HHH..GGGG.T', 'TA........GGGG.T', 'TA.HH..HH......T', 'TA.HH..HH..HH..T', 'T..........HH..T', 'TGG..GG........T', 'TTTTTTTTTTTTTTTT'],
  sinnoh: ['TTTTTTTTTTTTTTTT', 'T..HH..HH..HH..T', 'T..HH..HH..HH..T', 'T..HH..HH..HH..T', 'T..............T', 'T.HH.GGGG.HHH..T', 'T.HH.GGGG.HHH..T', 'T..............T', 'TAA.HH..HH..HH.T', 'TAA.HH..HH..HH.T', 'TAA............T', 'TTTTTTTTTTTTTTTT'],
  unova: ['TTTTTTTTTTTTTTTT', 'TTT..HHH.HHH.TTT', 'TT...HHH.HHH..TT', 'TT............TT', 'TTGG..HH..HH.GTT', 'TTGG..HH..HH.GTT', 'TT............TT', 'TT.HH.....HH..TT', 'TT.HH.GGG.HH..TT', 'TT....GGG.....TT', 'TT.........AA.TT', 'TTTTTTTTTTTTTTTT'],
  kalos: ['TTTTTTTTTTTTTTTT', 'T.HH.HH..HH.HH.T', 'T.HH.HH..HH.HH.T', 'T..............T', 'T.HH..GGGG..HH.T', 'T.HH..GHHG..HH.T', 'T.....GHHG.....T', 'T.HH..GGGG..HH.T', 'T.HH........HH.T', 'T..............T', 'T.GG...........T', 'TTTTTTTTTTTTTTTT'],
  alola: ['TTTTTTTTTTTTTTTT', 'T...HH..HHH....T', 'T...HH..HHH.GG.T', 'T.GG..........GT', 'T.GG.HH..HH....T', 'T....HH..HH..T.T', 'T..T..........GT', 'T.....GGG......T', 'TAA...GGG...AAAT', 'TAAA.......AAAAT', 'TAAAA......AAAAT', 'TTTTTTTTTTTTTTTT'],
  galar: ['TTTTTTTTTTTTTTTT', 'THHHH..HHHH.HHHT', 'THHHH..HHHH.HHHT', 'T..............T', 'T.HHH.GG.HHH...T', 'T.HHH.GG.HHH.GGT', 'T............GGT', 'THH..HHHHH..HH.T', 'THH..HHHHH..HH.T', 'T.GG..........HT', 'T.GG..........HT', 'TTTTTTTTTTTTTTTT'],
  paldea: ['TTTTTTTTTTTTTTTT', 'TT..HH....HH..TT', 'T...HH.GG.HH...T', 'T......GG......T', 'T.HHH......HHH.T', 'T.HHH.TTTT.HHH.T', 'T.....TTTT.....T', 'T.GG........GG.T', 'T.GG.HH..HH.GG.T', 'T....HH..HH....T', 'TAA.........GG.T', 'TTTTTTTTTTTTTTTT']
}

export const MAPS: Record<string, string[]> = { field: FIELD, center: CENTER, ...BIOME_MAPS, ...REGION_MAPS }

export const hasBiomeMap = (type: string): type is PokemonType => Object.hasOwn(BIOME_MAPS, type)
export const mapOf = ({ place, biome, region }: { place: Place; biome: PokemonType | null; region: RegionId }): MapId => (place === 'center' ? 'center' : (biome ?? region))

export const START: Pos = { x: 7, y: 10 }
export const CENTER_SPAWN: Pos = { x: 5, y: 7 }
export const ENCOUNTER_RATE = 0.15

const TILES: Record<string, Tile> = {
  T: 'tree',
  '.': 'path',
  G: 'grass',
  A: 'water',
  H: 'building',
  W: 'wall',
  F: 'floor',
  M: 'floor',
  K: 'counter',
  B: 'table',
  P: 'plant'
}
const outside = (map: MapId) => (map === 'center' ? 'W' : 'T')
const WALKABLE = new Set<Tile>(['path', 'grass', 'floor'])
const DELTA: Record<Dir, Pos> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }

export function tileAt(map: MapId, { x, y }: Pos): Tile {
  return TILES[MAPS[map][y]?.[x] ?? outside(map)]
}

const moved = (pos: Pos, dir: Dir): Pos => ({ x: pos.x + DELTA[dir].x, y: pos.y + DELTA[dir].y })

export function step(map: MapId, pos: Pos, dir: Dir): { pos: Pos; tile: Tile } {
  const next = moved(pos, dir)
  const tile = tileAt(map, next)
  return { pos: WALKABLE.has(tile) ? next : pos, tile }
}

const NEIGHBOR_BITS: [Dir, number][] = [
  ['up', 1],
  ['right', 2],
  ['down', 4],
  ['left', 8]
]

export function sameNeighbors(map: MapId, pos: Pos, tile: Tile): number {
  return NEIGHBOR_BITS.reduce((mask, [dir, bit]) => (tileAt(map, moved(pos, dir)) === tile ? mask | bit : mask), 0)
}
