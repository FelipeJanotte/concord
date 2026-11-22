import { MARKET_PRICE_MAX, type MarketListing, type SellRequest } from '../types/pokemon'
import { addItem, refuse, TEAM_LIMIT, type GameState, type Mon, type Refusal } from './game'
import { itemCategory } from './items'

export interface ForSale {
  game: GameState
  item: string | null
  quantity: number
  mon: Mon | null
}

const validPrice = (price: unknown): price is number => Number.isInteger(price) && (price as number) >= 1 && (price as number) <= MARKET_PRICE_MAX

export function takeForSale(game: GameState, request: SellRequest): ForSale | Refusal {
  if (game.battle) return refuse('Termine a batalha primeiro')
  if (!validPrice(request.price)) return refuse(`Preço de ₽1 a ₽${MARKET_PRICE_MAX.toLocaleString('pt-BR')}`)
  if (request.kind === 'item') {
    const { item, quantity } = request
    if (typeof item !== 'string' || itemCategory(item) === null) return refuse('Item inválido')
    if (!Number.isInteger(quantity) || quantity < 1) return refuse('Quantidade inválida')
    const owned = game.bag[item] ?? 0
    if (owned < quantity) return refuse('Você não tem essa quantidade')
    const bag = { ...game.bag, [item]: owned - quantity }
    if (bag[item] === 0) delete bag[item]
    return { game: { ...game, bag }, item, quantity, mon: null }
  }
  const inTeam = game.team.find((m) => m.uid === request.uid)
  const inPc = game.pc.find((m) => m.uid === request.uid)
  const mon = inTeam ?? inPc
  if (!mon) return refuse('Pokémon não encontrado')
  if (inTeam && game.team.length <= 1) return refuse('A equipe precisa de pelo menos 1 pokémon')
  const without = (list: Mon[]) => list.filter((m) => m.uid !== mon.uid)
  return { game: { ...game, team: without(game.team), pc: without(game.pc) }, item: null, quantity: 1, mon }
}

function receive(game: GameState, listing: MarketListing): GameState {
  if (listing.item) return { ...game, bag: addItem(game.bag, listing.item, listing.quantity) }
  const mon = listing.mon!
  return game.team.length < TEAM_LIMIT ? { ...game, team: [...game.team, mon] } : { ...game, pc: [...game.pc, mon] }
}

export function buyListing(buyer: GameState, seller: GameState, listing: MarketListing): { buyer: GameState; seller: GameState } | Refusal {
  if (buyer.money < listing.price) return refuse('Dinheiro insuficiente')
  return {
    buyer: receive({ ...buyer, money: buyer.money - listing.price }, listing),
    seller: { ...seller, money: seller.money + listing.price }
  }
}

export const returnListing = (seller: GameState, listing: MarketListing): GameState => receive(seller, listing)
