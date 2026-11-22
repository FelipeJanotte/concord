// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketListing, PokemonAction, PokemonResult } from '@shared/types'
import { createMon, newGame, startBattle, type GameState, type Species } from '@shared/pokemon/game'
import { MAPS } from '@shared/pokemon/map'
import { UtilityRail } from '@/components/rail/UtilityRail'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BALL_REVEAL_MS, BALL_SHAKE_MS, bindPokemonEvents } from '@/lib/actions/pokemon'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { PokemonView } from './PokemonView'

const species = (id: number, name: string, over: Partial<Species> = {}): Species => ({
  id,
  name,
  types: ['fire'],
  sprite: `${name}.png`,
  backSprite: `${name}-back.png`,
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [{ name: 'ember', power: 40, type: 'fire', level: 1, category: 'physical' }],
  evolution: null,
  ...over
})

const charmander = () => createMon(species(4, 'charmander'), 5, 'me')
const started = (over: Partial<GameState> = {}): GameState => ({ ...newGame(charmander(), 'male-1'), ...over })

let socket: FakeSocket
let current: GameState | null
let reply: (action: PokemonAction) => PokemonResult

beforeEach(() => {
  useApp.setState(initialState, true)
  useApp.setState({ self: { id: 'c1', accountId: 'acc-ana', name: 'Ana', color: '#000000' } as never })
  socket = new FakeSocket()
  current = null
  reply = () => ({ ok: true, game: current })
  socket.replyTo('pokemon:get', () => ({ ok: true, game: current }))
  socket.replyTo('pokemon:act', (action) => reply(action as PokemonAction))
  socket.replyTo('pokemon:listings', () => ({ ok: true, listings: [] }))
  setSocket(socket.asSocket())
  bindPokemonEvents(socket.asSocket())
})

afterEach(cleanup)

async function openGame(game: GameState | null) {
  current = game
  render(
    <TooltipProvider>
      <UtilityRail />
      <PokemonView />
    </TooltipProvider>
  )
  await userEvent.click(screen.getByRole('button', { name: 'Pokémon' }))
  await waitFor(() => expect(useApp.getState().pokemonLoaded).toBe(true))
}

describe('Pokémon no app', () => {
  it('a pokébola da barra abre o jogo e escolher o inicial pede ao servidor', async () => {
    await openGame(null)
    expect(useApp.getState().section).toBe('pokemon')
    reply = (action) => ({ ok: true, game: action.type === 'start' ? started() : null })
    expect(within(screen.getByRole('region', { name: 'Masculinos' })).getAllByRole('button')).toHaveLength(4)
    expect(within(screen.getByRole('region', { name: 'Femininos' })).getAllByRole('button')).toHaveLength(4)
    await userEvent.click(within(screen.getByRole('region', { name: 'Femininos' })).getByRole('button', { name: 'Treinadora 3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Charmander' }))
    expect(socket.sent('pokemon:act')).toEqual([[{ type: 'start', starter: 4, look: 'female-3' }]])
    expect(await screen.findByLabelText('Mapa')).toBeTruthy()
  })

  it('abrir a aba de novo pede o jogo atualizado ao servidor', async () => {
    await openGame(started())
    useApp.setState({ section: 'community' })
    current = started({ money: 4321 })
    await userEvent.click(screen.getByRole('button', { name: 'Pokémon' }))
    expect(socket.sent('pokemon:get')).toHaveLength(2)
    expect(await screen.findByText('₽4.321')).toBeTruthy()
  })

  it('cartão do treinador: treinador, nome do Concord, nível, XP do treinador e dinheiro, sem o XP do pokémon', async () => {
    await openGame(started({ trainer: { level: 12, xp: 30, look: 'male-1', facing: 'down' } }))
    const card = screen.getByRole('complementary', { name: 'Treinador' })
    expect(within(card).getByText('Ana')).toBeTruthy()
    expect(within(card).getByText('Treinador nv. 12')).toBeTruthy()
    expect(within(card).getByText('XP do treinador 30/120')).toBeTruthy()
    expect(within(card).queryByText(/XP de Charmander/)).toBeNull()
    expect(within(card).getByLabelText('Dinheiro').textContent).toBe('₽1.000')
    expect(within(card).getByRole('button', { name: /PvP/ }).hasAttribute('disabled') || within(card).getByRole('button', { name: /PvP/ }).getAttribute('data-disabled') !== null).toBe(true)
  })

  it('o treinador escolhido aparece no mapa virado para onde andou', async () => {
    await openGame(started({ trainer: { level: 1, xp: 0, look: 'female-1', facing: 'left' } }))
    const me = screen.getByRole('img', { name: 'Você' }).firstElementChild!
    expect(me.getAttribute('data-look')).toBe('female-1')
    expect(me.getAttribute('data-facing')).toBe('left')
  })

  it('entrar no Centro pelo modal do Mapa fecha o modal e as setas andam lá dentro', async () => {
    await openGame(started())
    socket.replyTo('pokemon:dex', () => ({ ok: true, entries: [] }))
    await userEvent.click(screen.getByRole('button', { name: 'Mapa' }))
    const dialog = await screen.findByRole('dialog', { name: 'Mapa' })
    reply = () => ({ ok: true, game: started({ place: 'center' }) })
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Centro Pokémon' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar no Centro Pokémon' }))
    expect(socket.sent('pokemon:act')).toEqual([[{ type: 'enter-center' }]])
    expect(await screen.findByLabelText('Centro Pokémon')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mapa' })).toBeNull())
    await userEvent.keyboard('w')
    expect(socket.sent('pokemon:act').at(-1)).toEqual([{ type: 'walk', dir: 'up' }])
  })

  it('caçando, o mapa usa a arte do tipo; sem caçada, a da cidade da região, com água e prédios', async () => {
    await openGame(started({ biome: 'fire', hunt: 4 }))
    const map = screen.getByLabelText('Mapa')
    expect((map.querySelector('[data-tile="grass"]') as HTMLElement).style.backgroundImage).toContain('biomes/fire/encounter')
    expect((map.querySelector('[data-tile="tree"]') as HTMLElement).style.backgroundImage).toContain('biomes/fire/obstacle')
    expect((map.querySelector('[data-tile="path"]') as HTMLElement).style.backgroundImage).toContain('biomes/fire/ground')
    cleanup()
    await openGame(started())
    const town = screen.getByLabelText('Mapa')
    expect((town.querySelector('[data-tile="water"]') as HTMLElement).style.backgroundImage).toContain('towns/kanto/water')
    expect((town.querySelector('[data-tile="building"]') as HTMLElement).style.backgroundImage).toContain('towns/kanto/building')
  })

  it('no centro, bater no balcão avisa a cura', async () => {
    const counterX = MAPS.center[1].indexOf('K')
    await openGame(started({ place: 'center', pos: { x: counterX, y: 2 } }))
    reply = () => ({ ok: true, game: current, tile: 'counter' })
    await userEvent.keyboard('{ArrowUp}')
    expect(await screen.findByText('Sua equipe foi curada!')).toBeTruthy()
  })

  it('a aba Computador guarda e pega de qualquer lugar', async () => {
    const pidgey = createMon(species(16, 'pidgey'), 4, 'p1')
    const rattata = createMon(species(19, 'rattata'), 4, 'r1')
    await openGame(started({ team: [charmander(), pidgey], pc: [rattata] }))
    await userEvent.click(screen.getByRole('button', { name: 'Computador' }))
    expect(screen.queryByText(/vá até o computador/i)).toBeNull()
    await userEvent.click(within(screen.getByRole('region', { name: 'Equipe' })).getAllByRole('button', { name: 'Guardar' })[1])
    await userEvent.click(within(screen.getByRole('region', { name: 'Computador' })).getByRole('button', { name: 'Pegar' }))
    expect(socket.sent('pokemon:act')).toEqual([[{ type: 'deposit', uid: 'p1' }], [{ type: 'withdraw', uid: 'r1' }]])
  })

  it('com 1 pokémon só na equipe o Guardar explica por que está desligado', async () => {
    await openGame(started())
    await userEvent.click(screen.getByRole('button', { name: 'Computador' }))
    expect(screen.getByText(/A equipe precisa de pelo menos 1 pokémon/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guardar' }).getAttribute('data-disabled')).not.toBeNull()
  })

  it('na batalha aparecem as 4 opções e o item vai para o servidor', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await openGame(startBattle(started(), createMon(species(16, 'pidgey', { types: ['normal'] }), 4, 'w')))
    for (const name of ['Lutar', 'Itens', 'Trocar', 'Fugir']) expect(screen.getByRole('button', { name })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Itens' }))
    await userEvent.click(screen.getByRole('button', { name: 'Poké Ball x10' }))
    expect(socket.sent('pokemon:act')).toEqual([[{ type: 'battle', action: { kind: 'item', item: 'pokeball' } }]])
    await act(() => vi.advanceTimersByTimeAsync(BALL_SHAKE_MS + BALL_REVEAL_MS))
    vi.useRealTimers()
  })

  it('Revive pede qual pokémon desmaiado reviver', async () => {
    const bulba = { ...createMon(species(1, 'bulbasaur'), 5, 'b1'), hp: 0 }
    const healthy = createMon(species(7, 'squirtle'), 5, 's1')
    await openGame(startBattle(started({ team: [charmander(), bulba, healthy], bag: { revive: 1, 'max-revive': 1 } }), createMon(species(16, 'pidgey'), 4, 'w')))
    await userEvent.click(screen.getByRole('button', { name: 'Itens' }))
    await userEvent.click(screen.getByRole('button', { name: 'Revive x1' }))
    expect(screen.queryByRole('button', { name: /Reviver Squirtle/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Reviver Bulbasaur' }))
    expect(socket.sent('pokemon:act')).toEqual([[{ type: 'battle', action: { kind: 'item', item: 'revive', target: 'b1' } }]])
  })

  it('sem pokémon desmaiado o Revive fica desligado', async () => {
    await openGame(startBattle(started({ bag: { revive: 1 } }), createMon(species(16, 'pidgey'), 4, 'w')))
    await userEvent.click(screen.getByRole('button', { name: 'Itens' }))
    expect(screen.getByRole('button', { name: 'Revive x1' }).getAttribute('data-disabled')).not.toBeNull()
  })

  it('mostra o painel do usuário com microfone e áudio, e o da voz quando está numa sala', async () => {
    useApp.setState({ channels: [{ id: 'v1', name: 'Sala de Voz', type: 'voice' } as never], myVoiceChannelId: 'v1' })
    await openGame(started())
    const dock = screen.getByRole('region', { name: 'Você' })
    expect(within(dock).getByRole('button', { name: 'Silenciar microfone' })).toBeTruthy()
    expect(within(dock).getByRole('button', { name: 'Desconectar' })).toBeTruthy()
    expect(within(dock).getByText('Sala de Voz')).toBeTruthy()
  })

  it('mochila lista os itens por categoria e troca o item segurado', async () => {
    await openGame(started({ bag: { pokeball: 3, leftovers: 1, 'stone-fire': 1, potion: 2, revive: 1 } }))
    await userEvent.click(screen.getByRole('button', { name: 'Mochila' }))
    expect(within(screen.getByRole('region', { name: 'Hold Items' })).getByText('Leftovers x1')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Pedras de evolução' })).getByText('Pedra de Fogo x1')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Pedras de evolução' }).querySelector('[data-stone="fire"]')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Poções' }).querySelector('[data-medicine="potion"]')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Reviver' }).querySelector('[data-medicine="revive"]')).toBeTruthy()
    await userEvent.click(screen.getByRole('combobox', { name: 'Charmander segura' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Leftovers' }))
    expect(socket.sent('pokemon:act')).toEqual([[{ type: 'hold', uid: 'me', item: 'leftovers' }]])
  })

  it('Market compra pela categoria; sem dinheiro o botão fica desligado', async () => {
    await openGame(started({ money: 500 }))
    await userEvent.click(screen.getByRole('button', { name: 'Shop' }))
    expect(screen.getByRole('tab', { name: 'Market' })).toBeTruthy()
    expect(screen.getByText('Taxa de captura 10x')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Comprar 1 Poké Ball' }))
    expect(socket.sent('pokemon:act')).toEqual([[{ type: 'buy', item: 'pokeball', quantity: 1 }]])
    expect(screen.getByRole('button', { name: 'Comprar 10 Poké Ball' }).getAttribute('data-disabled')).not.toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'Hold Items' }))
    expect(screen.getByText('Recupera 1/16 do HP no fim de cada turno')).toBeTruthy()
  })

  it('RMT: lista anúncios, compra pelo id e atualiza quando o servidor avisa', async () => {
    const listing: MarketListing = {
      id: 'l1',
      seller: { accountId: 'acc-bia', name: 'Bia' },
      item: 'stone-water',
      quantity: 1,
      mon: null,
      price: 400,
      createdAt: ''
    }
    socket.replyTo('pokemon:listings', () => ({ ok: true, listings: [listing] }))
    socket.replyTo('pokemon:buy-listing', () => ({ ok: true, game: started({ money: 600 }) }))
    await openGame(started())
    await userEvent.click(screen.getByRole('button', { name: 'Shop' }))
    await userEvent.click(screen.getByRole('tab', { name: 'RMT' }))
    const list = await screen.findByRole('list', { name: 'Anúncios' })
    expect(within(list).getByText("Pedra d'Água x1")).toBeTruthy()
    await userEvent.click(within(list).getByRole('button', { name: 'Comprar' }))
    expect(socket.sent('pokemon:buy-listing')).toEqual([['l1']])
    expect(screen.getByLabelText('Dinheiro').textContent).toBe('₽600')
    act(() => socket.receive('pokemon:listing-removed', { id: 'l1' }))
    expect(screen.getByText('Nenhum anúncio ainda.')).toBeTruthy()
    act(() => socket.receive('pokemon:state', started({ money: 9000 })))
    expect(screen.getByLabelText('Dinheiro').textContent).toBe('₽9.000')
  })

  it('recusa do servidor aparece como aviso', async () => {
    await openGame(started())
    reply = () => ({ ok: false, error: 'Vá até o Centro Pokémon' })
    await userEvent.keyboard('{ArrowLeft}')
    expect((await screen.findByRole('alert')).textContent).toBe('Vá até o Centro Pokémon')
  })
})
