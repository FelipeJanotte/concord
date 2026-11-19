// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessState, Channel, DmEntry, Message, User } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { bindPinsEvents } from '@/lib/actions/pins'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const dm: DmEntry = { channel: { id: 'dm1', name: '', type: 'dm', createdAt: 0 }, other: { id: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null } }
const msg = (id: string, content: string, over: Partial<Message> = {}): Message => ({ id, channelId: 'geral', author: ana, content, attachments: [], createdAt: 1, ...over })
const accessWith = (ownerAccountId: string) =>
  ({
    ownerAccountId,
    roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'attach'] }],
    members: [],
    overrides: []
  }) as unknown as AccessState

let socket: FakeSocket
const scrolled = vi.fn()

function setup(messages: Message[], { owner = false, channelId = 'geral' } = {}): void {
  useApp.setState({
    ...initialState,
    self: me,
    users: [me, ana],
    channels: [geral],
    dms: [dm],
    access: accessWith(owner ? 'acc-eu' : 'acc-dona'),
    view: { kind: 'text', channelId: 'geral' },
    messages: { [channelId]: messages },
    hasMoreHistory: { [channelId]: false }
  })
  render(
    <TooltipProvider>
      <ChatView channelId={channelId} />
    </TooltipProvider>
  )
}
const item = (text: string) => screen.getByText(text).closest('[id^="msg-"]') as HTMLElement

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindPinsEvents(socket.asSocket())
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

describe('fixar pela barra da mensagem', () => {
  it('quem pode fixa e desafixa; sem permissão não aparece', async () => {
    socket.replyTo('message:pin', () => ({ ok: true }))
    setup([msg('m1', 'importante'), msg('m2', 'já fixada', { pinnedAt: 5 })], { owner: true })
    await userEvent.click(within(item('importante')).getByRole('button', { name: 'Fixar mensagem' }))
    expect(socket.sent('message:pin')[0][0]).toEqual({ messageId: 'm1', on: true })
    await userEvent.click(within(item('já fixada')).getByRole('button', { name: 'Desafixar mensagem' }))
    expect(socket.sent('message:pin')[1][0]).toEqual({ messageId: 'm2', on: false })
    cleanup()
    setup([msg('m1', 'importante')])
    expect(within(item('importante')).queryByRole('button', { name: 'Fixar mensagem' })).toBeNull()
  })

  it('em conversa privada qualquer um dos dois fixa', () => {
    setup([msg('d1', 'nossa', { channelId: 'dm1' })], { channelId: 'dm1' })
    expect(within(item('nossa')).getByRole('button', { name: 'Fixar mensagem' })).toBeTruthy()
  })

  it('erro do servidor vira aviso', async () => {
    socket.replyTo('message:pin', () => ({ ok: false, error: 'Este canal já tem 50 mensagens fixadas' }))
    setup([msg('m1', 'importante')], { owner: true })
    await userEvent.click(within(item('importante')).getByRole('button', { name: 'Fixar mensagem' }))
    await vi.waitFor(() => expect(useApp.getState().notice?.text).toBe('Este canal já tem 50 mensagens fixadas'))
  })
})

describe('lista de fixadas', () => {
  it('o alfinete abre a lista; clicar rola até a mensagem', async () => {
    socket.replyTo('message:pins', () => [msg('m1', 'importante', { pinnedAt: 5 })])
    setup([msg('m1', 'importante', { pinnedAt: 5 }), msg('m2', 'outra')])
    await userEvent.click(screen.getByRole('button', { name: 'Mensagens fixadas' }))
    expect(socket.sent('message:pins')[0][0]).toEqual({ channelId: 'geral' })
    const list = await screen.findByRole('dialog', { name: 'Mensagens fixadas' })
    await userEvent.click(within(list).getByRole('button', { name: /importante/ }))
    expect(scrolled.mock.contexts.at(-1)).toBe(document.getElementById('msg-m1'))
    expect(screen.queryByRole('dialog', { name: 'Mensagens fixadas' })).toBeNull()
  })

  it('sem fixadas mostra o aviso; quem pode desafixa pela lista', async () => {
    socket.replyTo('message:pins', () => [])
    setup([msg('m1', 'importante')])
    await userEvent.click(screen.getByRole('button', { name: 'Mensagens fixadas' }))
    expect(await screen.findByText('Nenhuma mensagem fixada aqui ainda.')).toBeTruthy()
    cleanup()
    socket.replyTo('message:pins', () => [msg('m1', 'importante', { pinnedAt: 5 })])
    socket.replyTo('message:pin', () => ({ ok: true }))
    setup([], { owner: true })
    await userEvent.click(screen.getByRole('button', { name: 'Mensagens fixadas' }))
    const list = await screen.findByRole('dialog', { name: 'Mensagens fixadas' })
    await userEvent.click(within(list).getByRole('button', { name: 'Desafixar' }))
    expect(socket.sent('message:pin')[0][0]).toEqual({ messageId: 'm1', on: false })
  })
})

describe('aviso "fixou uma mensagem"', () => {
  it('mostra quem fixou e o link leva até a mensagem', async () => {
    const notice = msg('p1', '', { kind: 'pin', author: me, replyTo: { id: 'm1', authorName: 'Ana', authorAccountId: 'acc-ana', content: 'importante' } })
    setup([msg('m1', 'importante'), notice])
    const row = document.getElementById('msg-p1')!
    expect(row.textContent).toContain('Eu fixou uma mensagem')
    expect(within(row).queryByRole('button', { name: 'Responder' })).toBeNull()
    await userEvent.click(within(row).getByRole('button', { name: 'uma mensagem' }))
    expect(scrolled.mock.contexts.at(-1)).toBe(document.getElementById('msg-m1'))
  })
})
