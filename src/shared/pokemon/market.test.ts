import { describe, expect, it } from 'vitest'
import type { MarketListing } from '../types/pokemon'
import { createMon, newGame, type GameState, type Refusal, type Species } from './game'
import { buyListing, returnListing, takeForSale, type ForSale } from './market'

const species = (id: number): Species => ({
  id,
  name: `mon-${id}`,
  types: ['normal'],
  sprite: '',
  backSprite: '',
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [{ name: 'tackle', power: 40, type: 'normal', level: 1, category: 'physical' }],
  evolution: null
})
const mon = (uid: string) => createMon(species(1), 5, uid)
const game = (over: Partial<GameState> = {}): GameState => ({ ...newGame(mon('a'), 'male-1'), ...over })
const listing = (over: Partial<MarketListing>): MarketListing => ({
  id: 'l1',
  seller: { accountId: 's', name: 'Bia' },
  item: null,
  quantity: 1,
  mon: null,
  price: 500,
  createdAt: '',
  ...over
})

function sale(step: ForSale | Refusal): ForSale {
  if ('error' in step) throw new Error(step.error)
  return step
}

describe('RMT: anunciar', () => {
  it('item sai da mochila na hora do anúncio', () => {
    const s = sale(takeForSale(game({ bag: { 'stone-fire': 2 } }), { kind: 'item', item: 'stone-fire', quantity: 2, price: 9000 }))
    expect(s).toMatchObject({ item: 'stone-fire', quantity: 2, mon: null })
    expect(s.game.bag).toEqual({})
  })

  it('pokémon sai da equipe ou do computador, mas a equipe não fica vazia', () => {
    const b = mon('b')
    expect(sale(takeForSale(game({ pc: [b] }), { kind: 'mon', uid: 'b', price: 10 })).game.pc).toEqual([])
    expect(sale(takeForSale(game({ team: [mon('a'), b] }), { kind: 'mon', uid: 'b', price: 10 })).mon).toEqual(b)
    expect(takeForSale(game(), { kind: 'mon', uid: 'a', price: 10 })).toEqual({ error: 'A equipe precisa de pelo menos 1 pokémon' })
  })

  it('recusa preço inválido, item que não tem e durante a batalha', () => {
    expect('error' in takeForSale(game(), { kind: 'item', item: 'pokeball', quantity: 1, price: 0 })).toBe(true)
    expect('error' in takeForSale(game(), { kind: 'item', item: 'pokeball', quantity: 1, price: 1.5 })).toBe(true)
    expect(takeForSale(game(), { kind: 'item', item: 'leftovers', quantity: 1, price: 10 })).toEqual({ error: 'Você não tem essa quantidade' })
    expect(takeForSale(game(), { kind: 'item', item: 'banana', quantity: 1, price: 10 })).toEqual({ error: 'Item inválido' })
  })
})

describe('RMT: comprar e cancelar', () => {
  it('comprador paga e recebe; vendedor recebe o dinheiro', () => {
    const result = buyListing(game({ money: 600 }), game({ money: 0 }), listing({ item: 'leftovers', quantity: 1 }))
    if ('error' in result) throw new Error(result.error)
    expect(result.buyer.money).toBe(100)
    expect(result.buyer.bag.leftovers).toBe(1)
    expect(result.seller.money).toBe(500)
  })

  it('pokémon comprado vai para a equipe ou, cheia, para o computador', () => {
    const b = mon('b')
    const r1 = buyListing(game(), game(), listing({ mon: b }))
    if ('error' in r1) throw new Error(r1.error)
    expect(r1.buyer.team.map((m) => m.uid)).toEqual(['a', 'b'])
    const full = game({ team: ['1', '2', '3', '4', '5'].map(mon) })
    const r2 = buyListing(full, game(), listing({ mon: b }))
    if ('error' in r2) throw new Error(r2.error)
    expect(r2.buyer.pc.map((m) => m.uid)).toEqual(['b'])
  })

  it('sem dinheiro não compra', () => {
    expect(buyListing(game({ money: 10 }), game(), listing({ item: 'potion' }))).toEqual({ error: 'Dinheiro insuficiente' })
  })

  it('cancelar devolve ao vendedor', () => {
    expect(returnListing(game({ bag: {} }), listing({ item: 'potion', quantity: 3 })).bag).toEqual({ potion: 3 })
  })
})
