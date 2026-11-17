// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MusicState, MusicTrack } from '@shared/types'
import { initialState, useApp } from '@/store'
import { MusicQueueDialog } from './MusicQueueDialog'

const track = (n: number, coverUrl: string | null = `https://i.scdn.co/${n}.jpg`): MusicTrack => ({
  id: `t${n}`,
  title: `Música ${n}`,
  artists: ['Tom Jobim', 'Elis Regina'],
  coverUrl,
  durationMs: 185_000,
  url: `https://open.spotify.com/track/t${n}`,
  requestedBy: { accountId: 'acc-ana', name: n % 2 ? 'Ana' : 'Bia' }
})
const room = (queueSize: number, over: Partial<MusicState> = {}): MusicState => ({
  channelId: 'sala',
  nowPlaying: track(0),
  queue: Array.from({ length: queueSize }, (_, i) => track(i + 1)),
  ...over
})

const queueItems = (): HTMLElement[] => within(screen.getByRole('list', { name: 'Fila' })).getAllByRole('listitem')

beforeEach(() => {
  useApp.setState({ ...initialState, musicRooms: { sala: room(23) }, musicQueueChannelId: 'sala' })
})

afterEach(cleanup)

describe('MusicQueueDialog', () => {
  it('mostra a música atual e a fila com capa, título, artistas, duração e quem pediu', () => {
    render(<MusicQueueDialog />)
    const dialog = screen.getByRole('dialog', { name: 'Fila de músicas' })
    const now = within(dialog).getByRole('region', { name: 'Tocando agora' })
    expect(now.textContent).toContain('Música 0')
    const first = queueItems()[0]
    expect(first.textContent).toContain('1')
    expect(first.textContent).toContain('Música 1')
    expect(first.textContent).toContain('Tom Jobim, Elis Regina')
    expect(first.textContent).toContain('3:05')
    expect(first.textContent).toContain('Pedido por Ana')
    expect(within(first).getByRole('img', { name: 'Capa de Música 1' }).getAttribute('src')).toBe('https://i.scdn.co/1.jpg')
  })

  it('pagina de 10 em 10 com Anterior/Próxima e "Página X de Y"', async () => {
    render(<MusicQueueDialog />)
    expect(queueItems()).toHaveLength(10)
    expect(screen.getByText('Página 1 de 3')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement).disabled).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(screen.getByText('Página 2 de 3')).toBeTruthy()
    expect(queueItems()[0].textContent).toContain('11')
    expect(queueItems()[0].textContent).toContain('Música 11')

    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(queueItems()).toHaveLength(3)
    expect((screen.getByRole('button', { name: 'Próxima' }) as HTMLButtonElement).disabled).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByText('Página 2 de 3')).toBeTruthy()
  })

  it('fila vazia: avisa e não mostra a paginação', () => {
    useApp.setState({ musicRooms: { sala: room(0) } })
    render(<MusicQueueDialog />)
    expect(screen.getByText('Fila vazia.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Próxima' })).toBeNull()
  })

  it('nada tocando na sala: avisa', () => {
    useApp.setState({ musicRooms: {} })
    render(<MusicQueueDialog />)
    expect(screen.getByText('Nenhuma música tocando.')).toBeTruthy()
  })

  it('fechar limpa o painel da store', async () => {
    render(<MusicQueueDialog />)
    await userEvent.keyboard('{Escape}')
    expect(useApp.getState().musicQueueChannelId).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('fechado: não mostra nada', () => {
    useApp.setState({ musicQueueChannelId: null })
    render(<MusicQueueDialog />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
