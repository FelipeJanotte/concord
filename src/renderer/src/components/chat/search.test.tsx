// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessState, Channel, HistoryPage, Message, SearchResult, User } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { bindMessageEvents } from '@/lib/actions/messages'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const outro: Channel = { id: 'outro', name: 'outro', type: 'text', createdAt: 0 }
const msg = (id: string, content: string, over: Partial<Message> = {}): Message => ({ id, channelId: 'geral', author: ana, content, attachments: [], createdAt: 1, ...over })
const access = {
  ownerAccountId: 'acc-dona',
  roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'attach'] }],
  members: [],
  overrides: []
} as unknown as AccessState

let socket: FakeSocket
const scrolled = vi.fn()

function setup(messages: Message[]): void {
  useApp.setState({
    ...initialState,
    self: me,
    users: [me, ana],
    channels: [geral, outro],
    access,
    view: { kind: 'text', channelId: 'geral' },
    messages: { geral: messages },
    hasMoreHistory: { geral: false }
  })
  render(
    <TooltipProvider>
      <ChatView channelId="geral" />
    </TooltipProvider>
  )
}

async function search(text: string): Promise<void> {
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), `${text}{Enter}`)
}

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindMessageEvents(socket.asSocket())
  scrolled.mockClear()
  Element.prototype.scrollIntoView = scrolled
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})
afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('buscar mensagens', () => {
  it('Enter no campo busca e o painel mostra autor, canal e o trecho destacado', async () => {
    const found: SearchResult = { ok: true, messages: [msg('r1', 'bom dia, pessoal', { channelId: 'outro' })], hasMore: false }
    socket.replyTo('message:search', () => found)
    setup([])
    await search('bom')
    expect(socket.sent('message:search')[0][0]).toEqual({ query: 'bom' })
    const panel = screen.getByRole('complementary', { name: 'Resultados da busca' })
    expect(within(panel).getByText('1 resultado')).toBeTruthy()
    const result = within(panel).getByRole('button', { name: /Ana/ })
    expect(within(result).getByText('#outro')).toBeTruthy()
    expect(within(result).getByText('bom').tagName).toBe('MARK')
  })

  it('"Só neste canal" refaz a busca com o canal; sem resultado avisa; o X fecha', async () => {
    socket.replyTo('message:search', () => ({ ok: true, messages: [], hasMore: false }))
    setup([])
    await search('nada')
    const panel = screen.getByRole('complementary', { name: 'Resultados da busca' })
    expect(within(panel).getByText('Nenhum resultado')).toBeTruthy()
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Só neste canal' }))
    expect(socket.sent('message:search')[1][0]).toEqual({ query: 'nada', channelId: 'geral' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Fechar busca' }))
    expect(screen.queryByRole('complementary', { name: 'Resultados da busca' })).toBeNull()
  })

  it('erro da busca aparece no painel', async () => {
    setup([])
    await search('de:Caio oi')
    expect(screen.getByRole('alert').textContent).toBe('Ninguém chamado "Caio"')
    expect(socket.sent('message:search')).toEqual([])
  })

  it('clicar num resultado carregado rola até a mensagem e pisca', async () => {
    socket.replyTo('message:search', () => ({ ok: true, messages: [msg('m1', 'alvo aqui')], hasMore: false }))
    setup([msg('m1', 'alvo aqui'), msg('m2', 'depois')])
    await search('alvo')
    const panel = screen.getByRole('complementary', { name: 'Resultados da busca' })
    await userEvent.click(within(panel).getByRole('button', { name: /Ana/ }))
    const el = document.getElementById('msg-m1')!
    expect(scrolled).toHaveBeenCalled()
    expect(scrolled.mock.contexts.at(-1)).toBe(el)
    expect(el.dataset.highlight).toBe('true')
    expect(useApp.getState().jumpTarget).toBeNull()
  })

  it('resultado fora do histórico: carrega em volta dela, rola e oferece voltar para as recentes', async () => {
    socket.replyTo('message:search', () => ({ ok: true, messages: [msg('velha', 'alvo antigo')], hasMore: false }))
    const around: HistoryPage = { messages: [msg('a0', 'antes'), msg('velha', 'alvo antigo'), msg('a2', 'depois')], hasMore: true, hasNewer: true }
    const latest: HistoryPage = { messages: [msg('n1', 'nova')], hasMore: true }
    socket.replyTo('message:history', (req) => {
      const r = req as { around?: string; before?: string }
      if (r.around) return around
      return r.before ? { messages: [], hasMore: false } : latest
    })
    setup([msg('n1', 'nova')])
    await search('alvo')
    await userEvent.click(within(screen.getByRole('complementary', { name: 'Resultados da busca' })).getByRole('button', { name: /Ana/ }))
    expect(await screen.findByText('antes')).toBeTruthy()
    expect(socket.sent('message:history')[0][0]).toEqual({ channelId: 'geral', around: 'velha' })
    expect(scrolled.mock.contexts.at(-1)).toBe(document.getElementById('msg-velha'))
    await userEvent.click(screen.getByRole('button', { name: 'Ir para as mensagens recentes' }))
    expect(await screen.findByText('nova')).toBeTruthy()
    expect(screen.queryByText('antes')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ir para as mensagens recentes' })).toBeNull()
  })

  it('rolar até o fim com mensagens faltando carrega as mais novas', async () => {
    socket.replyTo('message:history', () => ({ messages: [msg('b1', 'mais nova')], hasMore: true, hasNewer: false }))
    setup([msg('a1', 'velha')])
    act(() => useApp.setState({ hasNewerHistory: { geral: true } }))
    const scroller = screen.getByText('velha').closest('.overflow-y-auto') as HTMLElement
    act(() => {
      scroller.dispatchEvent(new Event('scroll'))
    })
    expect(await screen.findByText('mais nova')).toBeTruthy()
    expect(socket.sent('message:history')[0][0]).toEqual({ channelId: 'geral', after: 'a1' })
  })
})
