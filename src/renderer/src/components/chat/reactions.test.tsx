// @vitest-environment jsdom
// Reações (A16) no app e na tela: listener, liga/tira, chips (contagem, minha, quem reagiu), seletor
// pela barra e pelo "+", sem permissão e erro do servidor.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessState, Channel, Message, Reaction, User } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { bindReactionsEvents, hasReacted, toggleReaction } from '@/lib/actions/reactions'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { reactorsLabel } from './Reactions'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const msg = (reactions?: Reaction[]): Message => ({ id: 'm1', channelId: 'geral', author: ana, content: 'boa!', attachments: [], createdAt: 1, ...(reactions ? { reactions } : {}) })
const accessWith = (permissions: string[]) =>
  ({ ownerAccountId: 'acc-dona', roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions }], members: [], overrides: [] }) as unknown as AccessState

let socket: FakeSocket

function setup(message: Message, permissions = ['view', 'send']): void {
  useApp.setState({ ...initialState, self: me, users: [me, ana], channels: [geral], access: accessWith(permissions), messages: { geral: [message] }, hasMoreHistory: { geral: false } })
  render(
    <TooltipProvider>
      <ChatView channelId="geral" />
    </TooltipProvider>
  )
}

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindReactionsEvents(socket.asSocket())
})
afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('ações', () => {
  it('message:reactions troca a lista; lista vazia tira o campo', () => {
    useApp.setState({ ...initialState, self: me, messages: { geral: [msg()] } })
    socket.receive('message:reactions', { channelId: 'geral', messageId: 'm1', reactions: [{ emoji: '👍', accountIds: ['acc-ana'] }] })
    expect(useApp.getState().messages.geral[0].reactions).toEqual([{ emoji: '👍', accountIds: ['acc-ana'] }])
    socket.receive('message:reactions', { channelId: 'geral', messageId: 'm1', reactions: [] })
    expect(useApp.getState().messages.geral[0]).not.toHaveProperty('reactions')
  })

  it('toggleReaction liga o que não tenho e tira o que tenho; erro vira exceção', async () => {
    useApp.setState({ ...initialState, self: me })
    socket.replyTo('message:react', () => ({ ok: true }))
    await toggleReaction(msg([{ emoji: '👍', accountIds: ['acc-eu'] }]), '👍')
    await toggleReaction(msg(), ' 🔥 ')
    expect(socket.sent('message:react').map((a) => a[0])).toEqual([
      { messageId: 'm1', emoji: '👍', on: false },
      { messageId: 'm1', emoji: '🔥', on: true }
    ])
    socket.replyTo('message:react', () => ({ ok: false, error: 'Esta mensagem já tem 20 reações diferentes' }))
    await expect(toggleReaction(msg(), '🤩')).rejects.toThrow('20 reações')
    await expect(toggleReaction(msg(), 'a b')).rejects.toThrow('Reação inválida')
    expect(hasReacted(msg([{ emoji: '👍', accountIds: ['acc-eu'] }]), '👍', undefined)).toBe(false)
  })

  it('quem reagiu: "você", nomes de quem está online e "mais N"', () => {
    const names = new Map([['acc-ana', 'Ana'], ['acc-bia', 'Bia']])
    expect(reactorsLabel({ emoji: '👍', accountIds: ['acc-eu'] }, names, 'acc-eu')).toBe('você')
    expect(reactorsLabel({ emoji: '👍', accountIds: ['acc-ana', 'acc-bia'] }, names, 'acc-eu')).toBe('Ana e Bia')
    expect(reactorsLabel({ emoji: '👍', accountIds: ['acc-ana', 'acc-x', 'acc-y'] }, names, 'acc-eu')).toBe('Ana e mais 2')
    expect(reactorsLabel({ emoji: '👍', accountIds: ['acc-x'] }, names, 'acc-eu')).toBe('1 pessoa')
  })
})

describe('na tela', () => {
  it('chips com contagem, o meu marcado; clicar tira a minha', async () => {
    socket.replyTo('message:react', () => ({ ok: true }))
    setup(msg([{ emoji: '👍', accountIds: ['acc-ana', 'acc-eu'] }, { emoji: '😂', accountIds: ['acc-ana'] }]))
    const list = screen.getByRole('list', { name: 'Reações' })
    const like = within(list).getByRole('button', { name: '👍 2: Ana e você' })
    expect(like.getAttribute('aria-pressed')).toBe('true')
    expect(within(list).getByRole('button', { name: '😂 1: Ana' }).getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(like)
    expect(socket.sent('message:react')[0][0]).toEqual({ messageId: 'm1', emoji: '👍', on: false })
  })

  it('"Adicionar reação" na barra abre o seletor; escolher reage e fecha', async () => {
    socket.replyTo('message:react', () => ({ ok: true }))
    setup(msg())
    expect(screen.queryByRole('list', { name: 'Reações' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar reação' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Coisas' }))
    await userEvent.click(screen.getByRole('button', { name: '🔥' }))
    expect(socket.sent('message:react')[0][0]).toEqual({ messageId: 'm1', emoji: '🔥', on: true })
    expect(screen.queryByRole('tablist', { name: 'Categorias de emoji' })).toBeNull()
  })

  it('o "+" ao lado dos chips abre o seletor; Esc fecha', async () => {
    setup(msg([{ emoji: '👍', accountIds: ['acc-ana'] }]))
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar outra reação' }))
    expect(screen.getByRole('tablist', { name: 'Categorias de emoji' })).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tablist', { name: 'Categorias de emoji' })).toBeNull()
  })

  it('erro do servidor aparece embaixo da mensagem', async () => {
    socket.replyTo('message:react', () => ({ ok: false, error: 'Muitas reações seguidas. Tente de novo em 1 s.' }))
    setup(msg([{ emoji: '👍', accountIds: ['acc-ana'] }]))
    await userEvent.click(screen.getByRole('button', { name: '👍 1: Ana' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Muitas reações seguidas. Tente de novo em 1 s.')
  })

  it('sem poder mandar mensagem: vê as reações, mas não reage', () => {
    setup(msg([{ emoji: '👍', accountIds: ['acc-ana'] }]), ['view'])
    expect(screen.getByRole('button', { name: '👍 1: Ana' })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: 'Adicionar outra reação' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Adicionar reação' })).toBeNull()
  })
})
