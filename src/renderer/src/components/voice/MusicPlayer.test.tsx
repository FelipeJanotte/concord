// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicState, MusicTrack } from '@shared/types'
import { applyMusicState, bindMusicEvents } from '@/lib/actions/music'
import { setSocket } from '@/lib/core'
import { MUSIC_BOT_VOLUME_ID, voice } from '@/lib/voice'
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
const playing = (over: Partial<MusicState> = {}): MusicState => ({ channelId: 'sala', nowPlaying: ipanema, queue: [aguas], paused: false, elapsedMs: 0, ...over })

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  socket.replyTo('music:queue', () => ({ ok: true, state: playing() }))
  useApp.setState({ ...initialState, myVoiceChannelId: 'sala' })
  localStorage.clear()
  vi.spyOn(voice, 'setUserVolume').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
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

  it('pular e parar mandam o comando para a sala, sem canal de texto (não postam no chat)', async () => {
    socket.replyTo('music:skip', () => ({ ok: true, state: playing({ nowPlaying: aguas, queue: [] }) }))
    socket.replyTo('music:stop', () => ({ ok: true, state: playing({ nowPlaying: null, queue: [] }) }))
    render(<MusicPlayer channelId="sala" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Pular música' }))
    expect(socket.sent('music:skip')).toEqual([[{ channelId: 'sala' }]])
    await screen.findByText('Águas de Março')
    await userEvent.click(screen.getByRole('button', { name: 'Parar a música' }))
    expect(socket.sent('music:stop')).toEqual([[{ channelId: 'sala' }]])
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Tocando agora' })).toBeNull())
  })

  it('embaralhar fica junto dos controles, manda music:shuffle sem canal de texto e desliga com menos de 2 na fila', async () => {
    const chega = track('t3', 'Chega de Saudade')
    socket.replyTo('music:queue', () => ({ ok: true, state: playing({ queue: [aguas, chega] }) }))
    socket.replyTo('music:shuffle', () => ({ ok: true, state: playing({ queue: [chega, aguas] }) }))
    render(<MusicPlayer channelId="sala" />)
    const button = await screen.findByRole('button', { name: 'Embaralhar a fila' })
    expect(button.parentElement).toBe(screen.getByRole('button', { name: 'Pular música' }).parentElement)
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
    await userEvent.click(button)
    expect(socket.sent('music:shuffle')).toEqual([[{ channelId: 'sala' }]])
    act(() => applyMusicState(playing({ queue: [aguas] })))
    expect((screen.getByRole('button', { name: 'Embaralhar a fila' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('pausar e retomar valem para todos da sala e o botão troca com o estado', async () => {
    socket.replyTo('music:pause', () => ({ ok: true, state: playing({ paused: true, elapsedMs: 30_000 }) }))
    socket.replyTo('music:resume', () => ({ ok: true, state: playing({ paused: false, elapsedMs: 30_000 }) }))
    render(<MusicPlayer channelId="sala" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar a música' }))
    expect(socket.sent('music:pause')).toEqual([[{ channelId: 'sala' }]])
    await userEvent.click(await screen.findByRole('button', { name: 'Retomar a música' }))
    expect(socket.sent('music:resume')).toEqual([[{ channelId: 'sala' }]])
    expect(await screen.findByRole('button', { name: 'Pausar a música' })).toBeTruthy()
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

  it('o volume do player é o mesmo do botão direito no bot: mudar num reflete no outro e fica salvo', async () => {
    useApp.setState({ musicRooms: { sala: playing() } })
    render(
      <>
        <MusicPlayer channelId="sala" />
        <MusicBotMember channelId="sala" />
      </>
    )
    const playerSlider = screen.getByRole('slider', { name: 'Volume da música' }) as HTMLInputElement
    expect(playerSlider.value).toBe('100')
    fireEvent.change(playerSlider, { target: { value: '30' } })
    expect(voice.setUserVolume).toHaveBeenLastCalledWith(MUSIC_BOT_VOLUME_ID, 0.3)
    expect(JSON.parse(localStorage.getItem('concord:audio') ?? '{}').volumes).toEqual({ [MUSIC_BOT_VOLUME_ID]: 0.3 })

    fireEvent.contextMenu(screen.getByTestId('music-bot'))
    const menuSlider = within(screen.getByRole('menu')).getByRole('slider', { name: 'Volume de Música' }) as HTMLInputElement
    expect(menuSlider.value).toBe('30')
    fireEvent.change(menuSlider, { target: { value: '70' } })
    expect(playerSlider.value).toBe('70')
  })

  it('quem só olha a sala não vê o volume (não está ouvindo)', async () => {
    useApp.setState({ myVoiceChannelId: null })
    render(<MusicPlayer channelId="sala" />)
    await screen.findByRole('region', { name: 'Tocando agora' })
    expect(screen.queryByRole('slider', { name: 'Volume da música' })).toBeNull()
  })

  it('ocultar recolhe para uma barra fina com o título; mostrar volta; a escolha fica guardada na máquina', async () => {
    const { unmount } = render(<MusicPlayer channelId="sala" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ocultar o player' }))
    expect(screen.queryByRole('region', { name: 'Tocando agora' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Música (oculto)' }).textContent).toContain('Tocando: Garota de Ipanema')
    unmount()

    render(<MusicPlayer channelId="sala" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar o player' }))
    expect(screen.getByRole('region', { name: 'Tocando agora' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Música (oculto)' })).toBeNull()
  })

  it('o botão Fila abre o painel da fila desta sala', async () => {
    render(<MusicPlayer channelId="sala" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver a fila' }))
    expect(useApp.getState().musicQueueChannelId).toBe('sala')
  })

  it('duas salas tocando: o cartão mostra a música da sala dele, e o music:state da outra não o muda', async () => {
    bindMusicEvents(socket.asSocket())
    render(<MusicPlayer channelId="sala" />)
    await screen.findByRole('region', { name: 'Tocando agora' })
    act(() => socket.receive('music:state', playing({ channelId: 'outra', nowPlaying: aguas, queue: [] })))
    expect(screen.getByRole('region', { name: 'Tocando agora' }).textContent).toContain('Garota de Ipanema')
    expect(useApp.getState().musicRooms.outra.nowPlaying?.title).toBe('Águas de Março')
    act(() => socket.receive('music:state', playing({ channelId: 'outra', nowPlaying: null, queue: [] })))
    expect(screen.getByRole('region', { name: 'Tocando agora' }).textContent).toContain('Garota de Ipanema')
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
