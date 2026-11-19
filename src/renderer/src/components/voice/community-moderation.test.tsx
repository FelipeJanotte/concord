// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EVERYONE_ROLE_ID, type AccessState, type Channel, type Permission, type User } from '@shared/types'
import { MemberList } from '@/components/MemberList'
import { Composer } from '@/components/chat/Composer'
import { CommunitySettingsDialog } from '@/components/settings/CommunitySettingsDialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const user = (accountId: string, name: string): User => ({
  id: `sock-${accountId}`,
  accountId,
  name,
  tag: accountId.slice(0, 5),
  color: '#aaaaaa',
  avatarUrl: null
})

const dona = user('dona', 'Dona')
const mod = user('mod', 'Mod')
const ana = user('ana', 'Ana')
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }

function access(modPermissions: Permission[]): AccessState {
  return {
    ownerAccountId: 'dona',
    roles: [
      { id: EVERYONE_ROLE_ID, name: '@todos', color: null, position: 0, permissions: ['view', 'send'] },
      { id: 'r-mod', name: 'Mod', color: null, position: 1, permissions: modPermissions }
    ],
    members: [{ accountId: 'mod', roleIds: ['r-mod'] }],
    overrides: []
  }
}

let socket: FakeSocket

function login(self: User, modPermissions: Permission[] = [], timeouts: Record<string, number> = {}) {
  useApp.setState({ ...initialState, self, users: [dona, mod, ana], channels: [geral], access: access(modPermissions), timeouts })
}

function menuOn(name: string): HTMLElement {
  fireEvent.contextMenu(screen.getAllByText(name)[0])
  return screen.getByRole('menu')
}

const renderMembers = () =>
  render(
    <TooltipProvider>
      <MemberList />
    </TooltipProvider>
  )

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  for (const event of ['moderation:kick', 'moderation:ban', 'moderation:unban', 'moderation:timeout'] as const) {
    socket.replyTo(event, () => ({ ok: true }))
  }
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
})

describe('botão direito: expulsar, banir e castigo', () => {
  it('cada permissão mostra só o seu item, para quem está abaixo e fora da voz', () => {
    login(mod, ['kickMembers'])
    renderMembers()
    const menu = menuOn('Ana')
    expect(within(menu).getByRole('menuitem', { name: /Expulsar da comunidade/ })).toBeTruthy()
    expect(within(menu).queryByRole('menuitem', { name: /Banir/ })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: /Castigo/ })).toBeNull()
  })

  it('sobre a dona ou sem permissão, nada aparece', () => {
    login(mod, ['kickMembers', 'banMembers', 'timeoutMembers'])
    renderMembers()
    const menu = menuOn('Dona')
    expect(within(menu).queryByRole('menuitem', { name: /Expulsar da comunidade|Banir|Castigo/ })).toBeNull()
  })

  it('expulsar pede confirmação e manda a conta', async () => {
    login(dona)
    renderMembers()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(within(menuOn('Ana')).getByRole('menuitem', { name: /Expulsar da comunidade/ }))
    expect(socket.sent('moderation:kick')).toHaveLength(0)
    confirm.mockReturnValue(true)
    await userEvent.click(within(menuOn('Ana')).getByRole('menuitem', { name: /Expulsar da comunidade/ }))
    expect(socket.sent('moderation:kick')[0][0]).toEqual({ accountId: 'ana' })
  })

  it('banir abre a janela com o motivo e manda a conta e o motivo', async () => {
    login(dona)
    renderMembers()
    await userEvent.click(within(menuOn('Ana')).getByRole('menuitem', { name: /Banir da comunidade/ }))
    const dialog = await screen.findByRole('dialog', { name: /Banir Ana/ })
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'spam')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Banir' }))
    expect(socket.sent('moderation:ban')[0][0]).toEqual({ accountId: 'ana', reason: 'spam' })
  })

  it('castigo oferece os prazos e manda os minutos; quem já está de castigo pode ter o castigo tirado', async () => {
    login(mod, ['timeoutMembers'])
    renderMembers()
    await userEvent.click(within(menuOn('Ana')).getByRole('menuitem', { name: /Castigo/ }))
    const sub = await screen.findByRole('menu', { name: 'Castigo' })
    expect(within(sub).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['1 minuto', '10 minutos', '1 hora', '1 dia', '1 semana'])
    await userEvent.click(within(sub).getByRole('menuitem', { name: '1 hora' }))
    expect(socket.sent('moderation:timeout')[0][0]).toEqual({ accountId: 'ana', minutes: 60 })

    cleanup()
    login(mod, ['timeoutMembers'], { ana: Date.now() + 60_000 })
    renderMembers()
    await userEvent.click(within(menuOn('Ana')).getByRole('menuitem', { name: /Castigo/ }))
    await userEvent.click(within(await screen.findByRole('menu', { name: 'Castigo' })).getByRole('menuitem', { name: 'Tirar castigo' }))
    expect(socket.sent('moderation:timeout')[1][0]).toEqual({ accountId: 'ana', minutes: 0 })
  })
})

describe('composer de castigo', () => {
  it('desliga o campo e mostra até quando', () => {
    const until = new Date(2030, 0, 1, 14, 30).getTime()
    login(ana, [], { ana: until })
    render(
      <TooltipProvider>
        <Composer channel={geral} />
      </TooltipProvider>
    )
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/^Você está de castigo até 01\/01 14:30\.$/)).toBeTruthy()
  })

  it('sem castigo o campo aparece', () => {
    login(ana, [], { mod: Date.now() + 60_000 })
    render(
      <TooltipProvider>
        <Composer channel={geral} />
      </TooltipProvider>
    )
    expect(screen.getByRole('textbox')).toBeTruthy()
  })
})

describe('banidos nas Configurações da comunidade', () => {
  const ban = { accountId: 'zeca', name: 'Zeca', tag: 'zeca', reason: 'spam', createdAt: 0 }

  it('quem pode banir vê a aba, a lista com o motivo e tira o banimento', async () => {
    login(mod, ['banMembers'])
    socket.replyTo('moderation:bans', () => ({ ok: true, bans: [ban] }))
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Banidos' }))
    const row = await screen.findByRole('group', { name: 'Banimento de Zeca' })
    expect(within(row).getByText('spam')).toBeTruthy()
    await userEvent.click(within(row).getByRole('button', { name: 'Tirar banimento' }))
    expect(socket.sent('moderation:unban')[0][0]).toEqual({ accountId: 'zeca' })
    expect(screen.queryByRole('group', { name: 'Banimento de Zeca' })).toBeNull()
  })

  it('lista vazia avisa; sem banMembers não há a aba', async () => {
    login(mod, ['banMembers'])
    socket.replyTo('moderation:bans', () => ({ ok: true, bans: [] }))
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Banidos' }))
    expect(await screen.findByText('Ninguém está banido.')).toBeTruthy()
    cleanup()
    login(mod, ['manageRoles'])
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    expect(screen.queryByRole('tab', { name: 'Banidos' })).toBeNull()
  })
})
