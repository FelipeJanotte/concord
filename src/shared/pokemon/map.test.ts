import { describe, expect, it } from 'vitest'
import { POKEMON_TYPES } from './types'
import { REGIONS } from './regions'
import { REGION_MAPS, BIOME_MAPS, CENTER_SPAWN, mapOf, MAPS, sameNeighbors, START, step, tileAt, type MapId } from './map'

describe('mapa de fora', () => {
  it('começa num caminho livre e não tem mais prédio no meio', () => {
    expect(tileAt('field', START)).toBe('path')
    expect(MAPS.field.join('')).not.toMatch(/[CKWB]/)
  })

  it('anda pelo caminho e para na árvore; fora do mapa é árvore', () => {
    expect(step('field', { x: 1, y: 1 }, 'right').pos).toEqual({ x: 2, y: 1 })
    expect(step('field', { x: 1, y: 1 }, 'up')).toEqual({ pos: { x: 1, y: 1 }, tile: 'tree' })
    expect(tileAt('field', { x: -1, y: 3 })).toBe('tree')
  })

  it('entrar no mato devolve o tile de mato', () => {
    const grass = findTile('grass')
    expect(step('field', { x: grass.x, y: grass.y + 1 }, 'up')).toEqual({ pos: grass, tile: 'grass' })
  })
})

describe('mapas por tipo', () => {
  const ids = Object.keys(BIOME_MAPS) as MapId[]

  it('todo tipo tem mapa próprio, menos Normal, que usa o mapa da região', () => {
    expect([...ids].sort()).toEqual(POKEMON_TYPES.filter((t) => t !== 'normal').sort())
    expect(mapOf({ place: 'outdoor', biome: null, region: 'kanto' })).toBe('kanto')
  })

  it.each(ids)('%s: 16x12, borda fechada, começo livre, com encontro e tudo alcançável', (id) => {
    const map = MAPS[id]
    expect(map).toHaveLength(12)
    expect(map.every((row) => row.length === 16)).toBe(true)
    expect(map[0] + map[11]).toMatch(/^T+$/)
    expect(map.every((row) => row[0] === 'T' && row[15] === 'T')).toBe(true)
    expect(tileAt(id, START)).toBe('path')
    expect(map.join('')).toMatch(/G/)
    const seen = new Set([`${START.x},${START.y}`])
    const queue = [START]
    while (queue.length) {
      const p = queue.pop()!
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const next = step(id, p, dir).pos
        const key = `${next.x},${next.y}`
        if (!seen.has(key)) (seen.add(key), queue.push(next))
      }
    }
    const open = map.flatMap((row, y) => [...row].map((c, x) => (c === 'T' ? null : `${x},${y}`))).filter(Boolean)
    expect(open.filter((k) => !seen.has(k!))).toEqual([])
  })

  it('os mapas são diferentes entre si e do mapa comum', () => {
    expect(new Set([MAPS.field, ...ids.map((id) => MAPS[id])].map((m) => m.join(''))).size).toBe(ids.length + 1)
  })

  it('o mapa do jogo: Centro dentro do centro; fora, o do tipo caçado, ou o da região', () => {
    expect(mapOf({ place: 'center', biome: 'fire', region: 'kanto' })).toBe('center')
    expect(mapOf({ place: 'outdoor', biome: 'fire', region: 'kanto' })).toBe('fire')
    expect(mapOf({ place: 'outdoor', biome: null, region: 'unova' })).toBe('unova')
  })
})

describe('mapas das regiões', () => {
  const regions = REGIONS.map((r) => r.id)

  it('cada uma das 9 regiões tem a sua cidade', () => {
    expect(Object.keys(REGION_MAPS).sort()).toEqual([...regions].sort())
  })

  it.each(regions)('%s: 16x12, borda fechada, começo livre, com mato, prédios e tudo alcançável', (id) => {
    const map = MAPS[id]
    expect(map).toHaveLength(12)
    expect(map.every((row) => row.length === 16)).toBe(true)
    const blocked = (c: string) => 'TAH'.includes(c)
    expect([...(map[0] + map[11])].every(blocked)).toBe(true)
    expect(map.every((row) => blocked(row[0]) && blocked(row[15]))).toBe(true)
    expect(tileAt(id, START)).toBe('path')
    expect(map.join('')).toMatch(/G/)
    expect(map.join('')).toMatch(/H/)
    const seen = new Set([`${START.x},${START.y}`])
    const queue = [START]
    while (queue.length) {
      const p = queue.pop()!
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const next = step(id, p, dir).pos
        const key = `${next.x},${next.y}`
        if (!seen.has(key)) (seen.add(key), queue.push(next))
      }
    }
    const open = map.flatMap((row, y) => [...row].map((c, x) => (blocked(c) ? null : `${x},${y}`))).filter(Boolean)
    expect(open.filter((k) => !seen.has(k!))).toEqual([])
  })

  it('água e prédios bloqueiam o caminho', () => {
    expect(tileAt('kanto', { x: 1, y: 1 })).toBe('water')
    expect(tileAt('kanto', { x: 10, y: 1 })).toBe('building')
    expect(step('kanto', { x: 9, y: 1 }, 'right')).toEqual({ pos: { x: 9, y: 1 }, tile: 'building' })
  })

  it('as cidades são diferentes entre si', () => {
    expect(new Set(regions.map((id) => MAPS[id].join(''))).size).toBe(9)
  })
})

describe('interior do Centro Pokémon', () => {
  it('começa no tapete da porta, no chão', () => {
    expect(tileAt('center', CENTER_SPAWN)).toBe('floor')
  })

  it('o balcão de cura fica no topo, no meio, e não há computador', () => {
    const top = MAPS.center[1]
    expect(top.indexOf('K')).toBeGreaterThan(1)
    expect(top.indexOf('K') + top.lastIndexOf('K')).toBe(top.length - 1)
    expect(MAPS.center.join('')).not.toMatch(/C/)
  })

  it('bater no balcão não sai do lugar e avisa o tile', () => {
    const counterX = MAPS.center[1].indexOf('K')
    expect(step('center', { x: counterX, y: 2 }, 'up')).toEqual({ pos: { x: counterX, y: 2 }, tile: 'counter' })
  })

  it('paredes, mesas e plantas bloqueiam; fora do interior é parede', () => {
    expect(step('center', { x: 1, y: 2 }, 'left').tile).toBe('wall')
    expect(tileAt('center', { x: 20, y: 20 })).toBe('wall')
    expect(MAPS.center.join('')).toMatch(/B/)
  })
})

describe('bordas dos tiles', () => {
  it('marca cima 1, direita 2, baixo 4, esquerda 8 quando o vizinho é do mesmo tipo', () => {
    expect(sameNeighbors('field', { x: 3, y: 5 }, 'grass')).toBe(1 | 2 | 4 | 8)
    expect(sameNeighbors('field', { x: 2, y: 4 }, 'grass')).toBe(2 | 4)
    expect(sameNeighbors('field', { x: 5, y: 6 }, 'grass')).toBe(1 | 8)
  })

  it('fora do mapa conta como árvore, então a borda do mapa é mata fechada', () => {
    expect(sameNeighbors('field', { x: 0, y: 0 }, 'tree')).toBe(1 | 2 | 4 | 8)
    expect(sameNeighbors('field', { x: 0, y: 5 }, 'tree')).toBe(1 | 4 | 8)
  })
})

function findTile(kind: string) {
  const map = MAPS.field
  for (let y = 0; y < map.length; y++)
    for (let x = 0; x < map[y].length; x++) if (tileAt('field', { x, y }) === kind && tileAt('field', { x, y: y + 1 }) === 'path') return { x, y }
  throw new Error(kind)
}
