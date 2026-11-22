import { randomUUID } from 'node:crypto'
import { MARKET_LISTINGS_PER_SELLER, type MarketListing, type PokemonResult, type SellRequest } from '../../src/shared/types'
import { refreshSpecies, withDefaults, type GameState, type Species } from '../../src/shared/pokemon/game'
import { buyListing, returnListing, takeForSale } from '../../src/shared/pokemon/market'
import { isRegionId } from '../../src/shared/pokemon/regions'
import { guard, type AppServer, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { pokeApiJson } from '../pokemon/drivers'
import { parseAction, runAction, type EngineDeps } from '../pokemon/engine'
import { fetchHuntInfo, fetchRegionDex, fetchSpecies } from '../pokemon/pokeapi'
import { closeListing, countListings, createListing, findListing, listListings, loadGame as loadSave, saveGame } from '../repo/pokemon'
import { emitToAccount } from './friends'

const API_DOWN = 'Não deu para falar com a PokeAPI. Tente de novo.'
const NO_GAME = 'Escolha seu primeiro pokémon'
const fail = (error: string): PokemonResult => ({ ok: false, error })

const deps: EngineDeps = {
  species: (id) => fetchSpecies(id, pokeApiJson()),
  huntInfo: (id) => fetchHuntInfo(id, pokeApiJson()),
  rng: Math.random,
  uid: randomUUID
}

async function currentSpecies(game: GameState): Promise<Map<number, Species>> {
  const ids = new Set([...game.team, ...game.pc, ...(game.battle ? [game.battle.wild] : [])].map((m) => m.species.id))
  const found = await Promise.all([...ids].map((id) => deps.species(id).then((s) => [id, s] as const, () => null)))
  return new Map(found.filter((entry) => entry !== null))
}

async function loadGame(accountId: string): Promise<GameState | null> {
  const saved = await loadSave(accountId)
  if (!saved) return null
  const game = withDefaults(saved)
  return refreshSpecies(game, await currentSpecies(game))
}

const queues = new Map<string, Promise<unknown>>()

async function withAccounts<T>(accountIds: string[], work: () => Promise<T>): Promise<T> {
  const ids = [...new Set(accountIds)].sort()
  const previous = Promise.all(ids.map((id) => queues.get(id)?.catch(() => undefined)))
  const run = previous.then(work)
  const settled = run.catch(() => undefined)
  for (const id of ids) queues.set(id, settled)
  try {
    return await run
  } finally {
    for (const id of ids) if (queues.get(id) === settled) queues.delete(id)
  }
}

function sellRequestOf(raw: unknown): SellRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.kind === 'item' && typeof r.item === 'string' && typeof r.quantity === 'number' && typeof r.price === 'number') {
    return { kind: 'item', item: r.item, quantity: r.quantity, price: r.price }
  }
  if (r.kind === 'mon' && typeof r.uid === 'string' && typeof r.price === 'number') return { kind: 'mon', uid: r.uid, price: r.price }
  return null
}

async function sell(io: AppServer, accountId: string, request: SellRequest): Promise<PokemonResult> {
  if ((await countListings(accountId)) >= MARKET_LISTINGS_PER_SELLER) return fail(`Você já tem ${MARKET_LISTINGS_PER_SELLER} anúncios`)
  return withAccounts([accountId], async () => {
    const game = await loadGame(accountId)
    if (!game) return fail(NO_GAME)
    const sale = takeForSale(game, request)
    if ('error' in sale) return fail(sale.error)
    const listing = await createListing({ id: randomUUID(), sellerId: accountId, item: sale.item, quantity: sale.quantity, mon: sale.mon, price: request.price }, sale.game)
    io.emit('pokemon:listing-added', listing)
    return { ok: true, game: sale.game }
  })
}

async function buy(io: AppServer, buyerId: string, listing: MarketListing): Promise<PokemonResult> {
  const sellerId = listing.seller.accountId
  if (sellerId === buyerId) return fail('Esse anúncio é seu')
  return withAccounts([buyerId, sellerId], async () => {
    const [buyer, seller] = await Promise.all([loadGame(buyerId), loadGame(sellerId)])
    if (!buyer) return fail(NO_GAME)
    if (!seller) return fail('Anúncio não está mais disponível')
    const deal = buyListing(buyer, seller, listing)
    if ('error' in deal) return fail(deal.error)
    const closed = await closeListing(listing.id, [
      { accountId: buyerId, game: deal.buyer },
      { accountId: sellerId, game: deal.seller }
    ])
    if (!closed) return fail('Anúncio não está mais disponível')
    io.emit('pokemon:listing-removed', { id: listing.id })
    emitToAccount(io, sellerId, 'pokemon:state', deal.seller)
    return { ok: true, game: deal.buyer }
  })
}

async function cancel(io: AppServer, accountId: string, listing: MarketListing): Promise<PokemonResult> {
  if (listing.seller.accountId !== accountId) return fail('Só quem anunciou pode cancelar')
  return withAccounts([accountId], async () => {
    const game = await loadGame(accountId)
    if (!game) return fail(NO_GAME)
    const back: GameState = returnListing(game, listing)
    if (!(await closeListing(listing.id, [{ accountId, game: back }]))) return fail('Anúncio não está mais disponível')
    io.emit('pokemon:listing-removed', { id: listing.id })
    return { ok: true, game: back }
  })
}

export const pokemonModule: ServerModule = {
  socket(io, socket) {
    const limited = (name: 'pokemon' | 'pokemonMarket', accountId: string): string | null => {
      const taken = limiters[name].take(accountId)
      return taken.ok ? null : `Muitas ações seguidas. ${retryText(taken.retryAfterMs)}`
    }

    socket.on('pokemon:get', (ack) => {
      if (typeof ack !== 'function') return
      void guard('pokemon:get', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        ack({ ok: true, game: await loadGame(user.accountId) })
      })
    })

    socket.on('pokemon:dex', (region, ack) => {
      if (typeof ack !== 'function') return
      void guard('pokemon:dex', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        if (!isRegionId(region)) return ack({ ok: false, error: 'Região inválida' })
        const tooMany = limited('pokemon', user.accountId)
        if (tooMany) return ack({ ok: false, error: tooMany })
        ack({ ok: true, entries: await fetchRegionDex(region, pokeApiJson()) })
      })
    })

    socket.on('pokemon:act', (raw, ack) => {
      if (typeof ack !== 'function') return
      void guard('pokemon:act', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        const action = parseAction(raw)
        if (!action) return ack(fail('Ação inválida'))
        const tooMany = limited('pokemon', user.accountId)
        if (tooMany) return ack(fail(tooMany))
        try {
          ack(
            await withAccounts([user.accountId], async () => {
              const result = await runAction(await loadGame(user.accountId), action, deps)
              if ('error' in result) return fail(result.error)
              await saveGame(user.accountId, result.game)
              return { ok: true, game: result.game, tile: result.tile }
            })
          )
        } catch (err) {
          ack(fail(API_DOWN))
          throw err
        }
      })
    })

    socket.on('pokemon:listings', (ack) => {
      if (typeof ack !== 'function') return
      void guard('pokemon:listings', async () => {
        if (!socket.data.user) return ack({ ok: false, error: 'Não autenticado' })
        ack({ ok: true, listings: await listListings() })
      })
    })

    socket.on('pokemon:sell', (raw, ack) => {
      if (typeof ack !== 'function') return
      void guard('pokemon:sell', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        const request = sellRequestOf(raw)
        if (!request) return ack(fail('Anúncio inválido'))
        const tooMany = limited('pokemonMarket', user.accountId)
        if (tooMany) return ack(fail(tooMany))
        ack(await sell(io, user.accountId, request))
      })
    })

    socket.on('pokemon:buy-listing', (id, ack) => {
      if (typeof ack !== 'function') return
      void guard('pokemon:buy-listing', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        const tooMany = limited('pokemonMarket', user.accountId)
        if (tooMany) return ack(fail(tooMany))
        const listing = typeof id === 'string' ? await findListing(id) : undefined
        if (!listing) return ack(fail('Anúncio não está mais disponível'))
        ack(await buy(io, user.accountId, listing))
      })
    })

    socket.on('pokemon:cancel-listing', (id, ack) => {
      if (typeof ack !== 'function') return
      void guard('pokemon:cancel-listing', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        const listing = typeof id === 'string' ? await findListing(id) : undefined
        if (!listing) return ack(fail('Anúncio não está mais disponível'))
        ack(await cancel(io, user.accountId, listing))
      })
    })
  }
}
