// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PokemonResult } from '@shared/types'
import { createMon, newGame, startBattle, type GameState, type Species } from '@shared/pokemon/game'
import { TooltipProvider } from '@/components/ui/tooltip'
import { bindPokemonEvents, BALL_REVEAL_MS, BALL_SHAKE_MS, showPokemon } from '@/lib/actions/pokemon'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { PokemonView } from './PokemonView'

const species = (id: number, name: string): Species => ({
  id,
  name,
  types: ['normal'],
  sprite: `${name}.png`,
  backSprite: `${name}-back.png`,
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [{ name: 'tackle', power: 40, type: 'normal', level: 1, category: 'physical' }],
  evolution: null
})

const wild = createMon(species(16, 'pidgey'), 4, 'w')
const fighting = startBattle({ ...newGame(createMon(species(4, 'charmander'), 10, 'me'), 'male-1'), bag: { greatball: 3, potion: 1 } }, wild)
const ended = (outcome: 'caught' | null, line: string): GameState => ({
  ...fighting,
  bag: { greatball: 2, potion: 1 },
  battle: { ...fighting.battle!, outcome, log: [...fighting.battle!.log, line] }
})

let socket: FakeSocket
let reply: GameState

async function battleWith(next: GameState) {
  reply = next
  render(
    <TooltipProvider>
      <PokemonView />
    </TooltipProvider>
  )
  await act(() => showPokemon())
  fireEvent.click(screen.getByRole('button', { name: 'Itens' }))
}

const later = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  useApp.setState(initialState, true)
  socket = new FakeSocket()
  socket.replyTo('pokemon:get', (): PokemonResult => ({ ok: true, game: fighting }))
  socket.replyTo('pokemon:act', (): PokemonResult => ({ ok: true, game: reply }))
  setSocket(socket.asSocket())
  bindPokemonEvents(socket.asSocket())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('animação de captura', () => {
  it('a bola balança sem revelar o resultado; capturou escurece com estrelas e depois mostra o fim', async () => {
    await battleWith(ended('caught', 'Você capturou Pidgey!'))
    fireEvent.click(screen.getByRole('button', { name: 'Great Ball x3' }))
    await later(BALL_SHAKE_MS - 10)
    expect(screen.getByRole('img', { name: 'Great Ball balançando' })).toBeTruthy()
    expect(screen.queryByText('Você capturou Pidgey!')).toBeNull()
    expect(screen.getByRole('button', { name: 'Fugir' }).getAttribute('data-disabled')).not.toBeNull()
    await later(20)
    expect(screen.getByRole('img', { name: 'Great Ball: capturado!' }).querySelectorAll('[data-star]')).toHaveLength(3)
    expect(screen.getByText('Você capturou Pidgey!')).toBeTruthy()
    await later(BALL_REVEAL_MS)
    expect(screen.queryByRole('img', { name: /Great Ball/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Voltar ao mapa' })).toBeTruthy()
  })

  it('escapou: a bola se abre e o selvagem volta', async () => {
    await battleWith(ended(null, 'Pidgey escapou!'))
    fireEvent.click(screen.getByRole('button', { name: 'Great Ball x3' }))
    await later(BALL_SHAKE_MS + 10)
    expect(screen.getByRole('img', { name: 'Great Ball se abriu' })).toBeTruthy()
    expect(document.querySelector('img[src="pidgey.png"]')).toBeNull()
    await later(BALL_REVEAL_MS)
    expect(screen.queryByRole('img', { name: /Great Ball/ })).toBeNull()
    expect(document.querySelector('img[src="pidgey.png"]')).toBeTruthy()
  })

  it('poção não anima', async () => {
    await battleWith({ ...fighting, bag: { greatball: 3 } })
    fireEvent.click(screen.getByRole('button', { name: 'Poção x1' }))
    await later(0)
    expect(screen.queryByRole('img', { name: /balançando/ })).toBeNull()
    expect(useApp.getState().pokemonGame!.bag).toEqual({ greatball: 3 })
  })
})
