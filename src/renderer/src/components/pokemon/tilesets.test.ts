import { describe, expect, it } from 'vitest'
import { BIOME_MAPS, REGION_MAPS, type MapId } from '@shared/pokemon/map'
import { tilesetOf } from './tilesets'

describe('arte dos mapas', () => {
  it.each(Object.keys(BIOME_MAPS) as MapId[])('%s usa a própria arte', (id) => {
    const tiles = tilesetOf(id)
    for (const part of ['ground', 'encounter', 'obstacle'] as const) expect(tiles[part]).toContain(`biomes/${id}/${part}`)
  })

  it.each(Object.keys(REGION_MAPS) as MapId[])('a cidade de %s usa a própria arte, com água e prédios', (id) => {
    const tiles = tilesetOf(id)
    for (const part of ['ground', 'encounter', 'obstacle', 'water', 'building'] as const) expect(tiles[part]).toContain(`towns/${id}/${part}`)
  })

  it('o mapa comum usa o mato e as árvores', () => {
    expect(tilesetOf('field').encounter).toContain('grass-tiles')
    expect(tilesetOf('field').obstacle).toContain('tree-tiles')
  })
})
