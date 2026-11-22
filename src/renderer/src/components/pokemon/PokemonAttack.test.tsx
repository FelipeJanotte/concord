// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PokemonResult } from '@shared/types'
import { createMon, newGame, startBattle, type GameState, type Species } from '@shared/pokemon/game'
import { TooltipProvider } from '@/components/ui/tooltip'
import { bindPokemonEvents, HIT_MS, showPokemon } from '@/lib/actions/pokemon'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { PokemonView } from './PokemonView'

const species = (id: number, name: string, types: string[]): Species => ({
  id,
  name,
  types,
  sprite: `${name}.png`,
  backSprite: `${name}-back.png`,
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [{ name: 'water-gun', power: 40, type: 'water', level: 1, category: 'special' }],
  evolution: null
})

const fighting = startBattle(newGame(createMon(species(7, 'squirtle', ['water']), 10, 'me'), 'male-1'), createMon(species(4, 'charmander', ['fire']), 8, 'w'))
const afterTurn: GameState = {
  ...fighting,
  battle: {
    ...fighting.battle!,
    wild: { ...fighting.battle!.wild, hp: 1 },
    log: [...fighting.battle!.log, 'Squirtle usou water-gun!'],
    hits: [
      { by: 'player', type: 'water', factor: 2 },
      { by: 'wild', type: 'fire', factor: 0.5 }
    ]
  }
}

const later = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const side = (name: 'Selvagem' | 'Seu pokémon') => screen.getByRole('group', { name })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  useApp.setState(initialState, true)
  const socket = new FakeSocket()
  socket.replyTo('pokemon:get', (): PokemonResult => ({ ok: true, game: fighting }))
  socket.replyTo('pokemon:act', (): PokemonResult => ({ ok: true, game: afterTurn }))
  setSocket(socket.asSocket())
  bindPokemonEvents(socket.asSocket())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('animação dos golpes', () => {
  it('cada golpe anima no alvo, na ordem; o dano só aparece depois', async () => {
    render(
      <TooltipProvider>
        <PokemonView />
      </TooltipProvider>
    )
    await act(() => showPokemon())
    fireEvent.click(screen.getByRole('button', { name: 'Lutar' }))
    fireEvent.click(screen.getByRole('button', { name: /water-gun/ }))
    await later(10)
    expect(within(side('Selvagem')).getByRole('img', { name: 'Ataque de Água' })).toBeTruthy()
    expect(within(side('Selvagem')).getByRole('img', { name: 'Charmander' }).dataset.strong).toBe('true')
    expect(screen.queryByText('Squirtle usou water-gun!')).toBeNull()
    await later(HIT_MS)
    expect(within(side('Seu pokémon')).getByRole('img', { name: 'Ataque de Fogo' })).toBeTruthy()
    expect(within(side('Seu pokémon')).getByRole('img', { name: 'Squirtle' }).dataset.strong).toBeUndefined()
    expect(within(side('Selvagem')).queryByRole('img', { name: /Ataque/ })).toBeNull()
    await later(HIT_MS)
    expect(screen.queryByRole('img', { name: /Ataque de/ })).toBeNull()
    expect(screen.getByText('Squirtle usou water-gun!')).toBeTruthy()
    expect(within(side('Selvagem')).getAllByRole('img', { name: 'Charmander' })).toHaveLength(1)
    expect(within(side('Seu pokémon')).getAllByRole('img', { name: 'Squirtle' })).toHaveLength(1)
  })
})
