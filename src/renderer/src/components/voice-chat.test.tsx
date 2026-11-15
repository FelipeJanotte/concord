// @vitest-environment jsdom
// Chat de texto da sala de voz (como no Discord): botão "Chat" no topo da sala, painel ao lado com o
// mesmo chat dos canais de texto, bolinha de mensagem nova e o atalho na barra lateral (sem entrar na voz).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, Message, User } from '@shared/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { bindMessageEvents } from '@/lib/actions/messages'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { ChannelSidebar } from './ChannelSidebar'
import { VoiceView } from './VoiceView'

const me: User = { id: 'eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#000', avatarUrl: null }
const ana: User = { id: 'ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#000', avatarUrl: null }
const sala: Channel = { id: 'sala', name: 'Jogos', type: 'voice', createdAt: 0 }
const msg = (content: string, author = ana): Message => ({ id: `m-${content}`, channelId: 'sala', author, content, attachments: [], createdAt: Date.now() })

let socket: FakeSocket

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindMessageEvents(socket.asSocket())
  socket.replyTo('message:history', () => ({ messages: [msg('alguém joga?')], hasMore: false }))
  useApp.setState({ ...initialState, self: me, users: [me, ana], channels: [sala], section: 'community', view: { kind: 'voice', channelId: 'sala' } })
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.unstubAllGlobals()
})

function renderView(): void {
  render(
    <TooltipProvider>
      <VoiceView channelId="sala" />
    </TooltipProvider>
  )
}

describe('chat da sala de voz', () => {
  it('"Chat" abre o painel ao lado com o histórico e o campo da sala; fechar esconde', async () => {
    renderView()
    expect(screen.queryByRole('complementary', { name: 'Chat da sala' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir o chat' }))
    const panel = screen.getByRole('complementary', { name: 'Chat da sala' })
    expect(await within(panel).findByText('alguém joga?')).toBeTruthy()
    expect(within(panel).getByPlaceholderText('Conversar em Jogos')).toBeTruthy()
    expect(within(panel).getByText('Chat de Jogos')).toBeTruthy() // boas-vindas da sala (sem "#")
    expect(within(panel).queryByRole('heading', { level: 1 })).toBeNull() // sem o cabeçalho do canal de texto

    await userEvent.click(within(panel).getByRole('button', { name: 'Fechar o chat' }))
    expect(screen.queryByRole('complementary', { name: 'Chat da sala' })).toBeNull()
  })

  it('manda mensagem no canal de voz (mesmo sem estar na voz)', async () => {
    useApp.setState({ voiceChatOpen: true })
    renderView()
    const box = await screen.findByPlaceholderText('Conversar em Jogos')
    await userEvent.type(box, 'eu jogo{Enter}')
    expect(socket.sent('message:send')[0][0]).toEqual({ channelId: 'sala', content: 'eu jogo' })
  })

  it('mensagem nova com o painel fechado: bolinha no botão; abrir limpa', async () => {
    renderView()
    act(() => socket.receive('message:new', msg('bora')))
    expect(screen.getByTestId('voice-chat-unread')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o chat (mensagens novas)' }))
    expect(screen.queryByTestId('voice-chat-unread')).toBeNull()
    expect(useApp.getState().unread.sala).toBeUndefined()
  })

  it('barra lateral: o atalho de chat abre a sala com o chat sem entrar na voz; mensagem nova deixa o nome em destaque', async () => {
    useApp.setState({ section: 'home', view: null, unread: { sala: true } })
    render(
      <TooltipProvider>
        <ChannelSidebar />
      </TooltipProvider>
    )
    const shortcut = screen.getByRole('button', { name: 'Abrir o chat da sala (mensagens novas)' })
    expect(shortcut.closest('[role="button"][tabindex="0"]')?.className).toContain('font-semibold')
    await userEvent.click(shortcut)
    expect(useApp.getState()).toMatchObject({ section: 'community', view: { kind: 'voice', channelId: 'sala' }, voiceChatOpen: true, myVoiceChannelId: null })
    expect(socket.sent('voice:join')).toEqual([])
  })
})
