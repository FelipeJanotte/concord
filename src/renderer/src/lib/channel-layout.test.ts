import { describe, expect, it } from 'vitest'
import type { Channel, ChannelCategory, ChannelLayout } from '@shared/types'
import { applyLayoutUpdate, groupChannels, layoutOf, layoutUpdate, moveCategory, moveChannel } from './channel-layout'

const ch = (id: string, position: number, categoryId: string | null = null, type: Channel['type'] = 'text'): Channel => ({
  id,
  name: id,
  type,
  createdAt: 0,
  position,
  categoryId
})
const cat = (id: string, position: number): ChannelCategory => ({ id, name: id, position })

describe('groupChannels', () => {
  it('sem categoria no topo e cada categoria com texto e voz juntos pela posição', () => {
    const grouped = groupChannels(
      [ch('voz', 3, 'k1', 'voice'), ch('geral', 0), ch('jogos', 2, 'k2'), ch('texto', 1, 'k1')],
      [cat('k2', 1), cat('k1', 0)]
    )
    expect(grouped.uncategorized.map((c) => c.id)).toEqual(['geral'])
    expect(grouped.groups.map((g) => [g.category.id, g.channels.map((c) => c.id)])).toEqual([
      ['k1', ['texto', 'voz']],
      ['k2', ['jogos']]
    ])
  })

  it('canal de categoria que não existe fica sem categoria; sem posição vai para o fim', () => {
    const semPosicao: Channel = { id: 'velho', name: 'velho', type: 'text', createdAt: 0 }
    const grouped = groupChannels([semPosicao, ch('a', 0, 'sumiu')], [])
    expect(grouped.uncategorized.map((c) => c.id)).toEqual(['a', 'velho'])
  })
})

const layout: ChannelLayout = {
  categories: ['k1', 'k2'],
  channels: [
    { id: 'a', categoryId: null },
    { id: 'b', categoryId: 'k1' },
    { id: 'c', categoryId: 'k1' },
    { id: 'd', categoryId: 'k2' }
  ]
}

describe('layoutOf', () => {
  it('monta a ordem inteira na ordem da tela', () => {
    const grouped = groupChannels([ch('d', 0, 'k2'), ch('c', 3, 'k1'), ch('b', 1, 'k1'), ch('a', 2)], [cat('k1', 0), cat('k2', 1)])
    expect(layoutOf(grouped)).toEqual(layout)
  })
})

describe('moveChannel', () => {
  it('antes de outro canal da mesma categoria', () => {
    expect(moveChannel(layout, 'c', { categoryId: 'k1', beforeId: 'b' }).channels.map((c) => c.id)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('para o fim de outra categoria', () => {
    expect(moveChannel(layout, 'a', { categoryId: 'k2', beforeId: null }).channels).toEqual([
      { id: 'b', categoryId: 'k1' },
      { id: 'c', categoryId: 'k1' },
      { id: 'd', categoryId: 'k2' },
      { id: 'a', categoryId: 'k2' }
    ])
  })

  it('para fora de qualquer categoria, antes de um canal solto', () => {
    expect(moveChannel(layout, 'd', { categoryId: null, beforeId: 'a' }).channels.slice(0, 2)).toEqual([
      { id: 'd', categoryId: null },
      { id: 'a', categoryId: null }
    ])
  })

  it('soltar em cima de si mesmo não muda nada', () => {
    expect(moveChannel(layout, 'b', { categoryId: 'k1', beforeId: 'b' })).toEqual(layout)
  })
})

describe('moveCategory', () => {
  it('antes de outra categoria e no fim', () => {
    expect(moveCategory(layout, 'k2', 'k1').categories).toEqual(['k2', 'k1'])
    expect(moveCategory(layout, 'k1', null).categories).toEqual(['k2', 'k1'])
  })

  it('reordena os canais junto com as categorias', () => {
    expect(moveCategory(layout, 'k2', 'k1').channels.map((c) => c.id)).toEqual(['a', 'd', 'b', 'c'])
  })
})

describe('layoutUpdate e applyLayoutUpdate', () => {
  it('posições pela ordem e só nos canais que eu tenho', () => {
    const update = layoutUpdate(moveChannel(layout, 'a', { categoryId: 'k2', beforeId: null }), [cat('k1', 0), cat('k2', 1)])
    expect(update.categories).toEqual([cat('k1', 0), cat('k2', 1)])
    const next = applyLayoutUpdate([ch('a', 0), ch('outro', 9)], update)
    expect(next).toEqual([ch('a', 3, 'k2'), ch('outro', 9)])
  })
})
