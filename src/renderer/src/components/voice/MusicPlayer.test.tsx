// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MusicState, MusicTrack } from '@shared/types'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { MusicBotMember, MusicPlayer } from './MusicPlayer'

const track = (id: string, title: string, coverUrl: string | null = 'https://i.scdn.co/capa.jpg'): MusicTrack => ({
  id,
  title,
  artists: ['Tom Jobim', 'Vinicius de Moraes'],
  coverUrl,
  durationMs: 185_000,
  url: `https://open.spotify.com/track/${id}`,
  requestedBy: { accountId: 'acc-ana', name: 'Ana' }
})
const ipanema = track('t1', 'Garota de Ipanema')
const aguas = track('t2', 'Águas de Março')
const playing = (over: Partial<MusicState> = {}): MusicState => ({ channelId: 'sala', nowPlaying: ipanema, queue: [aguas], ...over })

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  socket.replyTo('music:queue', () => ({ ok: true, state: playing() }))
  useApp.setState({ ...initialState, myVoiceChannelId: 'sala' })
})

afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('MusicPlayer', () => {
  it('busca o estado da sala ao abrir e mostra capa, título, artistas, quem pediu e a fila', async () => {
    render(<MusicPlayer channelId="sala" />)
    const card = await screen.findByRole('region', { name: 'Tocando agora' })
    expect(socket.sent('music:queue')).toEqual([['sala']])
    expect(card.textContent).toContain('Garota de Ipanema')
    expect(card.textContent).toContain('Tom Jobim, Vinicius de Moraes')
    expect(card.textContent).toContain('Pedido por Ana · 3:05 · 1 na fila')
    expect(screen.getByRole('img', { name: 'Capa de Garota de Ipanema' }).getAttribute('src')).toBe('https://i.scdn.co/capa.jpg')
  })

  it('nada tocando: não mostra o cartão', async () => {
    socket.replyTo('music:queue', () => ({ ok: true, state: playing({ nowPlaying: null, queue: [] }) }))
    const { container } = render(<MusicPlayer channelId="sala" />)
    await waitFor(() => expect(socket.sent('music:queue')).toHaveLength(1))
    expect(container.innerHTML).toBe('')
  })

  it('pular e parar mandam o comando para a sala', async () => {
    socket.replyTo('music:skip', () => ({ ok: true, state: playing({ nowPlaying: aguas, queue: [] }) }))
    socket.replyTo('music:stop', () => ({ ok: true, state: playing({ nowPlaying: null, queue: [] }) }))
    render(<MusicPlayer channelId="sala" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Pular música' }))
    expect(socket.sent('music:skip')).toEqual([['sala']])
    await screen.findByText('Águas de Março')
    await userEvent.click(screen.getByRole('button', { name: 'Parar a música' }))
    expect(socket.sent('music:stop')).toEqual([['sala']])
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Tocando agora' })).toBeNull())
  })

  it('erro ao pular aparece como aviso', async () => {
    socket.replyTo('music:skip', () => ({ ok: false, error: 'Entre na sala de voz para controlar a música' }))
    render(<MusicPlayer channelId="sala" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Pular música' }))
    await waitFor(() => expect(useApp.getState().notice?.text).toBe('Entre na sala de voz para controlar a música'))
  })

  it('quem só olha a sala (fora da voz) vê o cartão sem os botões', async () => {
    useApp.setState({ myVoiceChannelId: null })
    render(<MusicPlayer channelId="sala" />)
    await screen.findByRole('region', { name: 'Tocando agora' })
    expect(screen.queryByRole('button', { name: 'Pular música' })).toBeNull()
  })

  it('sem capa: mostra um ícone no lugar', async () => {
    socket.replyTo('music:queue', () => ({ ok: true, state: playing({ nowPlaying: track('t3', 'Sem capa', null) }) }))
    render(<MusicPlayer channelId="sala" />)
    await screen.findByText('Sem capa')
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('MusicBotMember', () => {
  it('aparece na lista da sala com o selo BOT só enquanto toca', () => {
    useApp.setState({ musicRooms: { sala: playing() } })
    const { rerender } = render(<MusicBotMember channelId="sala" />)
    expect(screen.getByTestId('music-bot').textContent).toBe('MúsicaBOT')
    useApp.setState({ musicRooms: {} })
    rerender(<MusicBotMember channelId="sala" />)
    expect(screen.queryByTestId('music-bot')).toBeNull()
  })
})
