// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PokemonAction, PokemonResult } from '@shared/types'
import { createMon, newGame, startBattle, type GameState, type Move, type Species } from '@shared/pokemon/game'
import { TooltipProvider } from '@/components/ui/tooltip'
import { bindPokemonEvents, setAutoSettings, showPokemon } from '@/lib/actions/pokemon'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { PokemonView } from './PokemonView'

const move = (name: string, level: number): Move => ({ name, power: 40, type: 'fire', level, category: 'physical' })
const charmander: Species = {
  id: 4,
  name: 'charmander',
  types: ['fire'],
  sprite: 'charmander.png',
  backSprite: 'charmander-back.png',
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [move('scratch', 1), move('ember', 4), move('bite', 9), move('flamethrower', 30)],
  evolution: { id: 5, level: 100, name: 'charmeleon' }
}

let socket: FakeSocket
let current: GameState
let sent: PokemonAction[]

function game(over: Partial<GameState> = {}): GameState {
  return { ...newGame(createMon(charmander, 10, 'me'), 'male-1'), pos: { x: 2, y: 3 }, ...over }
}

async function open(state: GameState) {
  current = state
  render(
    <TooltipProvider>
      <PokemonView />
    </TooltipProvider>
  )
  await showPokemon()
}

beforeEach(() => {
  localStorage.clear()
  useApp.setState(initialState, true)
  socket = new FakeSocket()
  sent = []
  socket.replyTo('pokemon:get', (): PokemonResult => ({ ok: true, game: current }))
  socket.replyTo('pokemon:act', (action): PokemonResult => {
    sent.push(action as PokemonAction)
    return { ok: true, game: current }
  })
  setSocket(socket.asSocket())
  bindPokemonEvents(socket.asSocket())
})

afterEach(() => {
  setAutoSettings({ fight: false })
  cleanup()
})

describe('Modo AFK', () => {
  it('Auto Catch e as pokébolas só ligam com o Auto Fight ligado', async () => {
    await open(game())
    const panel = screen.getByRole('region', { name: 'Modo AFK' })
    expect(within(panel).getByRole('switch', { name: /Auto Catch/ }).getAttribute('data-disabled')).not.toBeNull()
    await userEvent.click(within(panel).getByRole('switch', { name: /Auto Fight/ }))
    await userEvent.click(within(panel).getByRole('switch', { name: /Auto Catch/ }))
    await userEvent.click(within(panel).getByRole('checkbox', { name: /Ultra Ball/ }))
    expect(useApp.getState().pokemonAuto).toEqual({ fight: true, catch: true, balls: ['pokeball', 'ultraball'] })
    expect(JSON.parse(localStorage.getItem('concord:pokemon-auto')!).balls).toEqual(['pokeball', 'ultraball'])
    await userEvent.click(within(panel).getByRole('switch', { name: /Auto Fight/ }))
    expect(useApp.getState().pokemonAuto).toMatchObject({ fight: false, catch: false })
  })

  it('com o Auto Fight ligado o treinador anda sozinho para o mato', async () => {
    await open(game())
    await userEvent.click(within(screen.getByRole('region', { name: 'Modo AFK' })).getByRole('switch', { name: /Auto Fight/ }))
    await waitFor(() => expect(sent).toContainEqual({ type: 'walk', dir: expect.any(String) }), { timeout: 2000 })
  })
})

describe('equipe na coluna do treinador e evolução', () => {
  it('a equipe aparece logo abaixo dos botões do treinador', async () => {
    await open(game())
    const column = screen.getByRole('complementary', { name: 'Treinador' })
    expect(within(column).getByRole('region', { name: 'Sua equipe' })).toBeTruthy()
  })

  it('Evoluir abre o modal com a evolução e os requisitos; sem eles o botão fica desligado', async () => {
    await open(game())
    await userEvent.click(screen.getByRole('button', { name: 'Evoluir Charmander' }))
    const dialog = await screen.findByRole('dialog', { name: 'Evoluir Charmander' })
    expect(within(dialog).getByText('Charmeleon')).toBeTruthy()
    expect(within(dialog).getByText('Nível 100 (atual: 10)')).toBeTruthy()
    expect(within(dialog).getByText('Pedra de Fogo (você tem 0)')).toBeTruthy()
    expect(within(dialog).getByText('Essa ação não pode ser desfeita.')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Evoluir' }).getAttribute('data-disabled')).not.toBeNull()
  })

  it('com nível e pedra o modal deixa evoluir e manda a ação', async () => {
    await open(game({ team: [createMon(charmander, 100, 'me')], bag: { 'stone-fire': 1 } }))
    await userEvent.click(screen.getByRole('button', { name: 'Evoluir Charmander' }))
    const dialog = await screen.findByRole('dialog', { name: 'Evoluir Charmander' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Evoluir' }))
    expect(sent).toEqual([{ type: 'evolve', uid: 'me' }])
  })
})

describe('pokémon no computador', () => {
  it('abre centralizado com imagem, nome, radar dos atributos e a evolução', async () => {
    await open(game())
    await userEvent.click(screen.getByRole('button', { name: 'Computador' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ver Charmander' }))
    const dialog = await screen.findByRole('dialog', { name: 'Charmander' })
    const radar = within(dialog).getByRole('img', { name: 'Atributos de Charmander' })
    for (const label of ['Vida', 'Ataque físico', 'Defesa física', 'Ataque especial', 'Defesa especial', 'Velocidade']) expect(within(radar).getByText(label)).toBeTruthy()
    expect(radar.querySelectorAll('circle')).toHaveLength(6)
    expect(within(dialog).getByText('Total:').textContent).toBe('Total: 300')
    expect(within(dialog).getByRole('img', { name: 'Fogo' })).toBeTruthy()
    expect(within(dialog).getByLabelText('Natureza').textContent).toBe('Natureza: Hardy (neutra)')
    expect(radar.querySelector('path:nth-of-type(5)')?.getAttribute('d')).not.toContain('NaN')
    expect(within(within(dialog).getByRole('region', { name: 'Evolução' })).getByText('Nível 100 (atual: 10)')).toBeTruthy()
    expect(dialog.className).toContain('m-auto')
  })

  it('natureza que mexe em atributo aparece com ▲ e ▼ no radar e na legenda', async () => {
    await open(game({ team: [createMon(charmander, 10, 'me', 'adamant')] }))
    await userEvent.click(screen.getByRole('button', { name: 'Computador' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ver Charmander' }))
    const dialog = await screen.findByRole('dialog', { name: 'Charmander' })
    expect(within(dialog).getByLabelText('Natureza').textContent).toBe('Natureza: Adamant (▲ Ataque físico +10%, ▼ Ataque especial −10%)')
    expect(within(dialog).getByText('Ataque físico ▲')).toBeTruthy()
    expect(within(dialog).getByText('Ataque especial ▼')).toBeTruthy()
  })

  it('Alterar abre a lista: golpe de nível maior fica bloqueado; escolher troca a vaga e salva', async () => {
    const learner = { ...charmander, moves: [move('scratch', 1), move('ember', 4), move('metal-claw', 7), move('dragon-breath', 8), move('bite', 9), move('flamethrower', 30)] }
    await open(game({ team: [{ ...createMon(learner, 10, 'me'), moves: ['scratch', 'ember', 'metal-claw', 'dragon-breath'] }] }))
    await userEvent.click(screen.getByRole('button', { name: 'Computador' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ver Charmander' }))
    const dialog = await screen.findByRole('dialog', { name: 'Charmander' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Alterar scratch' }))
    const emberSlot = within(dialog).getByRole('button', { name: 'Alterar ember' }).closest('li')!
    expect(emberSlot.querySelector('[data-type="fire"]')).toBeTruthy()
    expect(emberSlot.querySelector('[data-category="physical"]')!.previousSibling!.textContent).toMatch(/poder 40$/)
    const list = within(dialog).getByRole('list', { name: 'Golpes disponíveis' })
    expect(within(list).getByRole('button', { name: /bite/ }).querySelector('[data-type="fire"]')).toBeTruthy()
    expect(within(list).getByRole('button', { name: /flamethrower/ }).getAttribute('data-disabled')).not.toBeNull()
    expect(within(list).queryByRole('button', { name: /ember/ })).toBeNull()
    await userEvent.click(within(list).getByRole('button', { name: /bite/ }))
    expect(sent).toEqual([{ type: 'set-moves', uid: 'me', moves: ['bite', 'ember', 'metal-claw', 'dragon-breath'] }])
  })
})

describe('batalha: tipos e dicas do golpe', () => {
  const oddish: Species = { ...charmander, id: 43, name: 'oddish', types: ['grass', 'poison'], moves: [move('absorb', 1)], evolution: null }

  it('mostra o tipo dos dois pokémon e, ao passar o mouse no golpe, a categoria, o tipo e a eficiência', async () => {
    const special = { ...createMon({ ...charmander, moves: [{ name: 'ember', power: 40, type: 'fire', level: 1, category: 'special' }] }, 10, 'me') }
    await open(startBattle(game({ team: [special] }), createMon(oddish, 5, 'w')))
    expect(screen.getAllByRole('img', { name: 'Planta' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: 'Venenoso' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: 'Fogo' }).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Lutar' }))
    expect(screen.getByRole('button', { name: /ember/ }).querySelector('[data-type="fire"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: /ember/ }).querySelector('[data-category="special"]')!.previousSibling!.textContent).toBe('40')
    await userEvent.hover(screen.getByRole('button', { name: /ember/ }))
    const tips = screen.getByLabelText('Dicas de ember')
    expect(tips.textContent).toContain('Ataque especial (Sp. Atk)')
    expect(tips.querySelector('[data-category="special"]')!.previousSibling!.textContent).toMatch(/poder 40$/)
    expect(tips.textContent).toContain('Fogo')
    expect(tips.textContent).toContain('2x (super efetivo)')
    await userEvent.unhover(screen.getByRole('button', { name: /ember/ }))
    expect(screen.getByRole('list', { name: 'Registro da batalha' })).toBeTruthy()
  })
})
