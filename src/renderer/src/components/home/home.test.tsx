// @vitest-environment jsdom
// B7 na tela: barra de úteis, Home (Amigos + conversas), chat da conversa e "Mensagem" no botão direito.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, DmEntry, FriendEntry, User } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { FriendsView } from '@/components/friends/FriendsView'
import { UtilityRail } from '@/components/rail/UtilityRail'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MemberContextMenu } from '@/components/voice/MemberContextMenu'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { HomeSidebar } from './HomeSidebar'

// o tooltip do Radix mede o botão; o jsdom não tem ResizeObserver
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const account = (id: string, name: string) => ({ id, name, tag: id, color: '#aaaaaa', avatarUrl: null })
const friend = (id: string, name: string, over: Partial<FriendEntry> = {}): FriendEntry => ({
  account: account(id, name),
  status: 'friend',
  since: 0,
  online: false,
  ...over
})
const dmWith = (id: string, name: string): DmEntry => ({
  channel: { id: `dm-${id}`, name: 'dm', type: 'dm', createdAt: 0 },
  other: account(id, name)
})
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }

let socket: FakeSocket

function setup(over: Partial<ReturnType<typeof useApp.getState>> = {}) {
  useApp.setState({ ...initialState, self: me, channels: [geral], friendsLoaded: true, ...over })
}
const ui = (node: React.ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>)

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
})

describe('barra de úteis', () => {
  it('Início e Concord trocam a seção; o selo soma pedidos recebidos e conversas não lidas', async () => {
    setup({
      friends: [friend('bia', 'Bia', { status: 'incoming' })],
      dms: [dmWith('ana', 'Ana')],
      unread: { 'dm-ana': true }
    })
    ui(<UtilityRail />)
    await userEvent.click(screen.getByRole('button', { name: 'Início (2)' }))
    expect(useApp.getState().section).toBe('home')
    await userEvent.click(screen.getByRole('button', { name: 'Concord' }))
    expect(useApp.getState().section).toBe('community')
  })
})

describe('Home', () => {
  it('lista as conversas (mais recente primeiro) e abre o chat com o nome da pessoa', async () => {
    setup({ dms: [dmWith('ana', 'Ana'), dmWith('caio', 'Caio')], friends: [friend('ana', 'Ana', { online: true })] })
    ui(<HomeSidebar />)
    const list = screen.getByRole('list', { name: 'Mensagens diretas' })
    // o texto inclui as iniciais do avatar
    expect(within(list).getAllByRole('button').map((b) => b.textContent?.replace(/^[A-Z]{2}/, ''))).toEqual(['Ana', 'Caio'])
    expect(within(list).getAllByLabelText(/^(Online|Offline)$/).map((e) => e.getAttribute('aria-label'))).toEqual([
      'Online',
      'Offline'
    ])
    await userEvent.click(within(list).getByRole('button', { name: /Ana/ }))
    expect(useApp.getState().homeView).toEqual({ kind: 'dm', channelId: 'dm-ana' })
  })

  it('sem conversas, diz que não há nenhuma; o botão Amigos mostra os pedidos recebidos', () => {
    setup({ friends: [friend('bia', 'Bia', { status: 'incoming' })] })
    ui(<HomeSidebar />)
    expect(screen.getByText('Nenhuma conversa ainda.')).toBeTruthy()
    expect(screen.getByLabelText('1 pedido(s) de amizade')).toBeTruthy()
  })

  it('o chat da conversa usa @nome e libera mandar mensagem mesmo sem cargos', () => {
    const dm = dmWith('ana', 'Ana')
    setup({
      dms: [dm],
      messages: { 'dm-ana': [] },
      // @todos sem "send" na comunidade não vale na conversa privada
      access: { ownerAccountId: 'outra', roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: [] }], members: [], overrides: [] }
    })
    ui(<ChatView channelId="dm-ana" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Ana' })).toBeTruthy()
    expect(screen.getByText('Este é o começo da sua conversa com @Ana.')).toBeTruthy()
    const box = screen.getByPlaceholderText('Conversar com @Ana') as HTMLTextAreaElement
    expect(box.disabled).toBe(false)
  })

  it('conversa sem histórico carregado (ex.: depois de reconectar) busca a página', () => {
    setup({ dms: [dmWith('ana', 'Ana')] })
    ui(<ChatView channelId="dm-ana" />)
    expect(socket.sent('message:history')).toEqual([[{ channelId: 'dm-ana' }]])
  })
})

describe('tela Amigos', () => {
  const entries = [
    friend('ana', 'Ana', { online: true }),
    friend('caio', 'Caio'),
    friend('bia', 'Bia', { status: 'incoming' }),
    friend('duda', 'Duda', { status: 'outgoing' }),
    friend('edu', 'Edu', { status: 'blocked' })
  ]

  it('abas: Online, Todos, Pendentes (com selo) e Bloqueados', async () => {
    setup({ friends: entries })
    ui(<FriendsView />)
    expect(screen.getByText('Online — 1')).toBeTruthy()
    await userEvent.click(screen.getByRole('tab', { name: 'Todos' }))
    expect(screen.getByText('Todos — 2')).toBeTruthy()
    await userEvent.click(screen.getByRole('tab', { name: /Pendentes/ }))
    expect(screen.getByText('Pedido de amizade recebido')).toBeTruthy()
    expect(screen.getByText('Pedido de amizade enviado')).toBeTruthy()
    await userEvent.click(screen.getByRole('tab', { name: 'Bloqueados' }))
    expect(screen.getByText('Edu')).toBeTruthy()
  })

  it('aceitar, recusar, cancelar, desbloquear e mandar mensagem mandam o evento certo', async () => {
    for (const ev of ['friend:accept', 'friend:decline', 'friend:unblock'] as const) socket.replyTo(ev, () => ({ ok: true, entry: null }))
    socket.replyTo('dm:open', () => ({ ok: true, dm: dmWith('ana', 'Ana') }))
    setup({ friends: entries })
    ui(<FriendsView />)

    await userEvent.click(screen.getByRole('button', { name: 'Mensagem' }))
    expect(socket.sent('dm:open')[0][0]).toBe('ana')
    expect(useApp.getState().homeView).toEqual({ kind: 'dm', channelId: 'dm-ana' })

    await userEvent.click(screen.getByRole('tab', { name: /Pendentes/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    expect(socket.sent('friend:accept')).toEqual([['bia']])
    expect(socket.sent('friend:decline')).toEqual([['bia'], ['duda']])

    await userEvent.click(screen.getByRole('tab', { name: 'Bloqueados' }))
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))
    expect(socket.sent('friend:unblock')).toEqual([['edu']])
  })

  it('desfazer amizade e bloquear pedem confirmação', async () => {
    socket.replyTo('friend:remove', () => ({ ok: true, entry: null }))
    socket.replyTo('friend:block', () => ({ ok: true, entry: null }))
    setup({ friends: [friend('ana', 'Ana', { online: true })] })
    ui(<FriendsView />)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer amizade' }))
    expect(socket.sent('friend:remove')).toHaveLength(0)
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer amizade' }))
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }))
    expect(socket.sent('friend:remove')).toEqual([['ana']])
    expect(socket.sent('friend:block')).toEqual([['ana']])
  })

  it('adicionar amigo por nome#id: mostra o resultado ou o erro do servidor', async () => {
    socket.replyTo('friend:request', (target) =>
      target === 'ana#ana'
        ? { ok: true, entry: friend('ana', 'Ana', { status: 'outgoing' }) }
        : { ok: false, error: 'Ninguém com esse nome#id' }
    )
    setup()
    ui(<FriendsView />)
    await userEvent.click(screen.getByRole('tab', { name: 'Adicionar amigo' }))
    const input = screen.getByLabelText('Nome e id da pessoa')
    await userEvent.type(input, ' ana#ana ')
    await userEvent.click(screen.getByRole('button', { name: /Enviar pedido/ }))
    expect(socket.sent('friend:request')[0][0]).toBe('ana#ana')
    expect((await screen.findByRole('status')).textContent).toBe('Pedido de amizade enviado para Ana#ana.')

    await userEvent.type(input, 'zé#zz')
    await userEvent.click(screen.getByRole('button', { name: /Enviar pedido/ }))
    expect((await screen.findByRole('status')).textContent).toBe('Ninguém com esse nome#id')
  })
})

describe('botão direito: "Mensagem"', () => {
  const ana: User = { id: 'sock-ana', accountId: 'ana', name: 'Ana', tag: 'ana', color: '#aaa', avatarUrl: null }

  function menu() {
    ui(
      <MemberContextMenu userId={ana.id}>
        <span>Ana</span>
      </MemberContextMenu>
    )
    fireEvent.contextMenu(screen.getByText('Ana'))
    return screen.getByRole('menu')
  }

  it('amiga: "Mensagem" abre a conversa', async () => {
    socket.replyTo('dm:open', () => ({ ok: true, dm: dmWith('ana', 'Ana') }))
    setup({ users: [me, ana], friends: [friend('ana', 'Ana')] })
    await userEvent.click(within(menu()).getByRole('menuitem', { name: 'Mensagem' }))
    expect(socket.sent('dm:open')[0][0]).toBe('ana')
    expect(useApp.getState().section).toBe('home')
  })

  it('sem relação: vira "Adicionar amigo" com o nome#id dela', async () => {
    socket.replyTo('friend:request', () => ({ ok: true, entry: friend('ana', 'Ana', { status: 'outgoing' }) }))
    setup({ users: [me, ana] })
    const m = menu()
    expect(within(m).queryByRole('menuitem', { name: 'Mensagem' })).toBeNull()
    await userEvent.click(within(m).getByRole('menuitem', { name: 'Adicionar amigo' }))
    expect(socket.sent('friend:request')[0][0]).toBe('Ana#ana')
  })

  it('pedido pendente ou bloqueada: nenhum dos dois', () => {
    setup({ users: [me, ana], friends: [friend('ana', 'Ana', { status: 'blocked' })], dms: [dmWith('ana', 'Ana')] })
    const m = menu()
    expect(within(m).queryByRole('menuitem', { name: /Mensagem|Adicionar amigo/ })).toBeNull()
  })
})

