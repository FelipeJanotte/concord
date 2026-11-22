// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DexResult, PokemonAction, PokemonResult } from '@shared/types'
import { createMon, newGame, type GameState, type Species } from '@shared/pokemon/game'
import type { RegionId } from '@shared/pokemon/regions'
import { TooltipProvider } from '@/components/ui/tooltip'
import { bindPokemonEvents, showPokemon } from '@/lib/actions/pokemon'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { PokemonView } from './PokemonView'

const charmander: Species = {
  id: 4,
  name: 'charmander',
  types: ['fire'],
  sprite: 'charmander.png',
  backSprite: 'charmander-back.png',
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [{ name: 'ember', power: 40, type: 'fire', level: 1, category: 'special' }],
  evolution: null
}

let socket: FakeSocket
let current: GameState
let sent: PokemonAction[]
let dexAsked: RegionId[]

const game = (over: Partial<GameState> = {}): GameState => ({ ...newGame(createMon(charmander, 10, 'me'), 'male-1'), ...over })

async function open(state: GameState) {
  current = state
  render(
    <TooltipProvider>
      <PokemonView />
    </TooltipProvider>
  )
  await showPokemon()
  await userEvent.click(screen.getByRole('button', { name: 'Mapa' }))
  return screen.findByRole('dialog', { name: 'Mapa' })
}

beforeEach(() => {
  useApp.setState(initialState, true)
  socket = new FakeSocket()
  sent = []
  dexAsked = []
  socket.replyTo('pokemon:get', (): PokemonResult => ({ ok: true, game: current }))
  socket.replyTo('pokemon:act', (action): PokemonResult => {
    sent.push(action as PokemonAction)
    return { ok: true, game: current }
  })
  socket.replyTo('pokemon:dex', (region): DexResult => {
    dexAsked.push(region as RegionId)
    return {
      ok: true,
      entries: [
        { id: 25, name: 'pikachu', types: ['electric'] }
      ]
    }
  })
  setSocket(socket.asSocket())
  bindPokemonEvents(socket.asSocket())
})

afterEach(cleanup)

describe('modal do Mapa', () => {
  it('as abas são o Centro Pokémon e as regiões; região bloqueada fica desligada', async () => {
    const dialog = await open(game())
    expect(within(dialog).getByRole('tab', { name: 'Centro Pokémon' })).toBeTruthy()
    expect(within(dialog).getByRole('tab', { name: 'Kanto' })).toBeTruthy()
    const johto = within(dialog).getByRole('tab', { name: /Johto/ })
    expect(johto.textContent).toContain('(100)')
    expect(johto.getAttribute('data-disabled')).not.toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Região' })).toBeNull()
  })

  it('a região lista os pokémon dela; Caçar leva para lá caçando aquele pokémon e fecha o modal', async () => {
    const dialog = await open(game())
    await waitFor(() => expect(within(dialog).getByText('pikachu')).toBeTruthy())
    expect(dexAsked).toEqual(['kanto'])
    expect(within(within(dialog).getByText('pikachu').closest('li')!).getByRole('img', { name: 'Elétrico' })).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Caçar pikachu' }))
    expect(sent).toEqual([{ type: 'travel', region: 'kanto', hunt: 25 }])
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mapa' })).toBeNull())
  })

  it('caçando, o pokémon aparece marcado e dá para parar de caçar', async () => {
    const dialog = await open(game({ hunt: 25 }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Caçar pikachu' }).getAttribute('aria-pressed')).toBe('true'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Parar de caçar' }))
    expect(sent).toEqual([{ type: 'travel', region: 'kanto' }])
  })

  it('abrir o modal de novo pede a lista da região outra vez', async () => {
    const dialog = await open(game())
    await waitFor(() => expect(within(dialog).getByText('pikachu')).toBeTruthy())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mapa' })).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Mapa' }))
    await screen.findByRole('dialog', { name: 'Mapa' })
    await waitFor(() => expect(dexAsked).toEqual(['kanto', 'kanto']))
  })

  it('a aba Centro Pokémon tem o botão de entrar', async () => {
    const dialog = await open(game())
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Centro Pokémon' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar no Centro Pokémon' }))
    expect(sent).toEqual([{ type: 'enter-center' }])
  })
})
