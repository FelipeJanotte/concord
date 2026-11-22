import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { MarketListing, PokemonAction, PokemonResult } from '../../src/shared/types'
import type { GameState } from '../../src/shared/pokemon/game'
import { TestServer, waitFor, type TestUser } from './helpers'

let server: TestServer
const open: TestUser[] = []

beforeAll(async () => {
  server = await TestServer.start({ imports: ['./server/tests/fake-pokeapi.ts'] })
})
afterEach(() => {
  for (const u of open.splice(0)) u.socket.close()
})
afterAll(async () => {
  await server?.destroy()
})

async function user(name: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u)
  return u
}

const act = (u: TestUser, action: PokemonAction) => u.socket.emitWithAck('pokemon:act', action)

function game(res: PokemonResult): GameState {
  if (!res.ok) throw new Error(res.error)
  if (!res.game) throw new Error('sem jogo')
  return res.game
}

async function trainer(name: string): Promise<{ u: TestUser; game: GameState }> {
  const u = await user(name)
  return { u, game: game(await act(u, { type: 'start', starter: 4, look: 'female-1' })) }
}

describe('pokemon: jogo no servidor', () => {
  it('começa uma vez, fica salvo na conta e volta no pokemon:get', async () => {
    const ana = await user('Ana')
    expect(await ana.socket.emitWithAck('pokemon:get')).toEqual({ ok: true, game: null })
    const started = game(await act(ana, { type: 'start', starter: 4, look: 'female-1' }))
    expect(started.team[0]).toMatchObject({ level: 5, species: { id: 4, name: 'mon-4', evolution: { id: 5, level: 100 } } })
    expect(await act(ana, { type: 'start', starter: 1, look: 'male-1' })).toEqual({ ok: false, error: 'Você já começou o jogo' })
    expect(game(await ana.socket.emitWithAck('pokemon:get'))).toEqual(started)
  })

  it('andar no mato acaba achando um selvagem de Kanto e a batalha fica salva', async () => {
    const { u } = await trainer('Bia')
    let state: GameState | null = game(await act(u, { type: 'walk', dir: 'up' }))
    if (!state.battle) state = game(await act(u, { type: 'walk', dir: 'up' }))
    for (let i = 0; i < 120 && !state?.battle; i++) {
      state = game(await act(u, { type: 'walk', dir: i % 2 ? 'right' : 'left' }))
      if (i % 25 === 24) await new Promise((r) => setTimeout(r, 2600))
    }
    expect(state?.battle?.wild.species.id).toBeGreaterThanOrEqual(1)
    expect(state?.battle?.wild.species.id).toBeLessThanOrEqual(151)
    expect(game(await u.socket.emitWithAck('pokemon:get')).battle).toEqual(state!.battle)
    expect(await act(u, { type: 'walk', dir: 'up' })).toEqual({ ok: false, error: 'Termine a batalha primeiro' })
  }, 30_000)

  it('compra no market e recusa o que não pode', async () => {
    const { u } = await trainer('Caio')
    const bought = game(await act(u, { type: 'buy', item: 'greatball', quantity: 1 }))
    expect(bought.money).toBe(400)
    expect(bought.bag.greatball).toBe(1)
    expect(await act(u, { type: 'buy', item: 'ultraball', quantity: 1 })).toEqual({ ok: false, error: 'Dinheiro insuficiente' })
    expect(await act(u, { type: 'travel', region: 'johto' })).toEqual({ ok: false, error: 'Região liberada no nível 100 de treinador' })
    expect(await u.socket.emitWithAck('pokemon:act', { type: 'buy', item: 'pokeball', quantity: 'muitas' } as never)).toEqual({ ok: false, error: 'Ação inválida' })
  })
})

describe('pokemon: lista da região', () => {
  it('devolve só a primeira forma dos pokémon da região, pela ordem da Pokédex; região inválida é recusada', async () => {
    const u = await user('Dexter')
    const res = await u.socket.emitWithAck('pokemon:dex', 'kanto')
    if (!res.ok) throw new Error(res.error)
    expect(res.entries.map((e) => e.id).slice(0, 3)).toEqual([1, 4, 7])
    expect(res.entries).toHaveLength(51)
    expect(res.entries[0].types).toEqual(['normal'])
    expect(await u.socket.emitWithAck('pokemon:dex', 'atlantis' as never)).toEqual({ ok: false, error: 'Região inválida' })
  })
})

describe('pokemon: RMT', () => {
  it('anunciar tira da mochila, comprar paga o vendedor e todos veem o anúncio sumir', async () => {
    const ana = await trainer('Duda')
    const bia = await trainer('Edu')
    const added = waitFor(bia.u.socket, 'pokemon:listing-added', (l) => l.seller.name === 'Duda')
    const sold = game(await ana.u.socket.emitWithAck('pokemon:sell', { kind: 'item', item: 'potion', quantity: 2, price: 300 }))
    expect(sold.bag.potion).toBe(3)
    const [listing] = (await added) as [MarketListing]
    expect(listing).toMatchObject({ item: 'potion', quantity: 2, price: 300, mon: null })
    const listed = await bia.u.socket.emitWithAck('pokemon:listings')
    expect(listed.ok && listed.listings.some((l) => l.id === listing.id)).toBe(true)

    expect(await ana.u.socket.emitWithAck('pokemon:buy-listing', listing.id)).toEqual({ ok: false, error: 'Esse anúncio é seu' })
    expect(await bia.u.socket.emitWithAck('pokemon:cancel-listing', listing.id)).toEqual({ ok: false, error: 'Só quem anunciou pode cancelar' })

    const paid = waitFor(ana.u.socket, 'pokemon:state', (g) => g.money === 1300)
    const removed = waitFor(ana.u.socket, 'pokemon:listing-removed', (p) => p.id === listing.id)
    const bought = game(await bia.u.socket.emitWithAck('pokemon:buy-listing', listing.id))
    expect(bought.money).toBe(700)
    expect(bought.bag.potion).toBe(7)
    await paid
    await removed
    expect(await bia.u.socket.emitWithAck('pokemon:buy-listing', listing.id)).toEqual({ ok: false, error: 'Anúncio não está mais disponível' })
  })

  it('cancelar devolve o item; o único pokémon da equipe não pode ser anunciado', async () => {
    const ana = await trainer('Fabi')
    const starter = ana.game.team[0].uid
    expect(await ana.u.socket.emitWithAck('pokemon:sell', { kind: 'mon', uid: starter, price: 10 })).toEqual({ ok: false, error: 'A equipe precisa de pelo menos 1 pokémon' })
    const added = waitFor(ana.u.socket, 'pokemon:listing-added', (l) => l.seller.name === 'Fabi')
    await ana.u.socket.emitWithAck('pokemon:sell', { kind: 'item', item: 'pokeball', quantity: 10, price: 50 })
    const [listing] = (await added) as [MarketListing]
    const back = game(await ana.u.socket.emitWithAck('pokemon:cancel-listing', listing.id))
    expect(back.bag.pokeball).toBe(10)
  })
})
