// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DmEntry, FriendEntry, Preferences, User } from '@shared/types'
import { DEFAULT_THEME } from '@shared/types'
import { DmList } from '@/components/dm/DmList'
import { FriendsView } from '@/components/friends/FriendsView'
import { MemberList } from '@/components/MemberList'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UserPanel } from '@/components/UserPanel'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const person = (id: string, name: string): User => ({ id: `sock-${id}`, accountId: `acc-${id}`, name, tag: id, color: '#aaaaaa', avatarUrl: null })
const me = person('eu', 'Eu')
const ana = person('ana', 'Ana')
const bia = person('bia', 'Bia')
const caio = person('caio', 'Caio')
const friendOf = (u: User, online: boolean): FriendEntry => ({
  account: { id: u.accountId, name: u.name, tag: u.tag, color: u.color, avatarUrl: null },
  status: 'friend',
  since: 0,
  online
})
const dmWith = (u: User): DmEntry => ({ channel: { id: `dm-${u.tag}`, name: 'dm', type: 'dm', createdAt: 0 }, other: friendOf(u, true).account })
const prefs = (doNotDisturb: boolean): Preferences => ({ theme: DEFAULT_THEME, savedThemes: [], mutedChannels: [], doNotDisturb })

let socket: FakeSocket
const ui = (node: React.ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>)

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
  useApp.setState({ ...initialState, self: me, users: [me, ana, bia, caio], statuses: { 'acc-ana': 'idle', 'acc-bia': 'dnd' } })
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.unstubAllGlobals()
})

describe('bolinha de status', () => {
  it('lista de membros: amarela para ausente, vermelha para Não perturbe, verde para online', () => {
    ui(<MemberList />)
    const dot = (name: string) => within(screen.getByText(name).closest('div') as HTMLElement).getByRole('img')
    expect(dot('Ana').getAttribute('aria-label')).toBe('Ausente')
    expect(dot('Ana').className).toContain('bg-idle')
    expect(dot('Bia').getAttribute('aria-label')).toBe('Não perturbe')
    expect(dot('Bia').className).toContain('bg-destructive')
    expect(dot('Caio').getAttribute('aria-label')).toBe('Online')
    expect(dot('Caio').className).toContain('bg-success')
  })

  it('amigos e conversas: status só para amigo online; offline continua cinza', () => {
    useApp.setState({ friends: [friendOf(ana, true), friendOf(bia, false)], friendsLoaded: true, dms: [dmWith(ana), dmWith(bia)] })
    ui(
      <>
        <FriendsView />
        <DmList />
      </>
    )
    const dms = within(screen.getByRole('list', { name: 'Mensagens diretas' }))
    expect(dms.getByRole('img', { name: 'Ausente' })).toBeTruthy()
    expect(dms.getByRole('img', { name: 'Offline' })).toBeTruthy()
    expect(dms.queryByRole('img', { name: 'Não perturbe' })).toBeNull()
    expect(screen.getAllByText('Ausente').length).toBeGreaterThan(0)
  })
})

describe('UserPanel', () => {
  it('mostra o meu status e escolhe Não perturbe (salvo na conta)', async () => {
    socket.replyTo('preferences:update', () => ({ ok: true, preferences: prefs(true) }))
    useApp.setState({ statuses: { 'acc-eu': 'idle' } })
    ui(<UserPanel />)
    expect(screen.getByRole('img', { name: 'Ausente' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Status e conta' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Não perturbe/ }))
    expect(socket.sent('preferences:update')).toEqual([[{ doNotDisturb: true }]])
    expect(useApp.getState().doNotDisturb).toBe(true)
  })

  it('com Não perturbe ligado, "Online" desliga', async () => {
    socket.replyTo('preferences:update', () => ({ ok: true, preferences: prefs(false) }))
    useApp.setState({ doNotDisturb: true, statuses: { 'acc-eu': 'dnd' } })
    ui(<UserPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Status e conta' }))
    expect(screen.getByRole('menuitemradio', { name: /Não perturbe/ }).getAttribute('aria-checked')).toBe('true')
    await userEvent.click(screen.getByRole('menuitemradio', { name: /^Online/ }))
    expect(socket.sent('preferences:update')).toEqual([[{ doNotDisturb: false }]])
  })

  it('"Minha conta" continua abrindo as configurações da conta', async () => {
    ui(<UserPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Status e conta' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Minha conta' }))
    expect(useApp.getState().settingsSection).toBe('account')
  })
})
