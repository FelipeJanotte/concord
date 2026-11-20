// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountInfo, CustomStatus, FriendEntry, User } from '@shared/types'
import { CustomStatusText } from '@/components/CustomStatusText'
import { FriendsView } from '@/components/friends/FriendsView'
import { MemberList } from '@/components/MemberList'
import { AccountSettings } from '@/components/settings/AccountSettings'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UserPanel } from '@/components/UserPanel'
import { UserProfileDialog } from '@/components/UserProfileDialog'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const ANA_ID = '11111111-1111-4111-8111-111111111111'
const playing: CustomStatus = { emoji: '🎮', text: 'jogando', expiresAt: null }
const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#aaaaaa', avatarUrl: null, bio: '', customStatus: null }
const ana: User = {
  id: 'sock-ana',
  accountId: ANA_ID,
  name: 'Ana',
  tag: 'ana',
  color: '#aaaaaa',
  avatarUrl: null,
  bio: '**forte** e\nsegunda linha <@11111111-1111-4111-8111-111111111111>',
  customStatus: playing
}
const account: AccountInfo = {
  id: 'acc-eu',
  email: 'eu@exemplo.com',
  name: 'Eu',
  tag: 'eu',
  color: '#aaaaaa',
  avatarUrl: null,
  hasPassword: true,
  hasGoogle: false,
  tagLocked: true,
  bio: '',
  customStatus: null
}

let socket: FakeSocket
const ui = (node: React.ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>)
const inMs = (ms: number): string => new Date(Date.now() + ms).toISOString()

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
  useApp.setState({ ...initialState, self: me, account, users: [me, ana] })
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('status personalizado curto', () => {
  it('mostra emoji e texto e some sozinho quando vence', () => {
    vi.useFakeTimers()
    ui(<CustomStatusText status={{ emoji: '☕', text: 'já volto', expiresAt: inMs(60_000) }} />)
    expect(screen.getByText('☕ já volto')).toBeTruthy()

    act(() => vi.advanceTimersByTime(60_000))

    expect(screen.queryByText('☕ já volto')).toBeNull()
  })

  it('status já vencido não aparece', () => {
    ui(<CustomStatusText status={{ text: 'velho', expiresAt: inMs(-1000) }} />)
    expect(screen.queryByText('velho')).toBeNull()
  })

  it('lista de membros mostra o status embaixo do nome', () => {
    ui(<MemberList />)
    const row = screen.getByText('Ana').closest('div') as HTMLElement
    expect(within(row).getByText('🎮 jogando')).toBeTruthy()
  })

  it('lista de amigos mostra o status do amigo', () => {
    const entry: FriendEntry = {
      account: { id: ANA_ID, name: 'Ana', tag: 'ana', color: '#aaaaaa', avatarUrl: null, customStatus: { text: 'estudando', expiresAt: null } },
      status: 'friend',
      since: 0,
      online: true
    }
    useApp.setState({ friends: [entry], friendsLoaded: true })
    ui(<FriendsView />)
    expect(screen.getByText('estudando')).toBeTruthy()
  })
})

describe('cartão de perfil', () => {
  it('mostra a bio formatada como no chat, sem chip de menção, e o status', () => {
    ui(<UserProfileDialog userId="sock-ana" open onOpenChange={() => {}} />)
    const bio = screen.getByRole('region', { name: 'Sobre mim' })
    expect(within(bio).getByText('forte').tagName).toBe('STRONG')
    expect(bio.textContent).toContain('segunda linha <@11111111-1111-4111-8111-111111111111>')
    expect(bio.querySelector('[data-mention]')).toBeNull()
    expect(screen.getByText('🎮 jogando')).toBeTruthy()
  })

  it('sem bio, sem a seção', () => {
    useApp.setState({ users: [me, { ...ana, bio: '', customStatus: null }] })
    ui(<UserProfileDialog userId="sock-ana" open onOpenChange={() => {}} />)
    expect(screen.queryByRole('region', { name: 'Sobre mim' })).toBeNull()
  })
})

describe('Minha conta: bio', () => {
  it('conta os caracteres e salva a bio com o resto do perfil', async () => {
    socket.replyTo('account:update', () => ({ ok: true, account: { ...account, bio: 'oi' } }))
    ui(<AccountSettings />)
    expect(screen.getByText('0/190')).toBeTruthy()

    await userEvent.type(screen.getByRole('textbox', { name: 'Bio' }), 'oi')

    expect(screen.getByText('2/190')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(socket.sent('account:update')[0][0]).toEqual({ name: 'Eu', bio: 'oi' })
  })
})

describe('Status e conta: status personalizado', () => {
  it('define emoji, texto e "Limpar depois de"', async () => {
    socket.replyTo('account:update', () => ({ ok: true, account }))
    ui(<UserPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Status e conta' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Definir status personalizado' }))

    const dialog = screen.getByRole('dialog', { name: 'Definir status personalizado' })
    await userEvent.click(within(dialog).getByRole('button', { name: '🎧' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Status' }), 'cochilando')
    await userEvent.click(within(dialog).getByRole('radio', { name: '1 hora' }))
    const before = Date.now()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    const [update] = socket.sent('account:update')[0] as [{ customStatus: CustomStatus }]
    expect(update.customStatus).toMatchObject({ emoji: '🎧', text: 'cochilando' })
    const expires = Date.parse(update.customStatus.expiresAt!)
    expect(expires).toBeGreaterThanOrEqual(before + 60 * 60_000)
    expect(expires).toBeLessThanOrEqual(Date.now() + 60 * 60_000)
  })

  it('mostra o erro do servidor e não fecha', async () => {
    socket.replyTo('account:update', () => ({ ok: false, error: 'Emoji inválido' }))
    ui(<UserPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Status e conta' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Definir status personalizado' }))
    const dialog = screen.getByRole('dialog', { name: 'Definir status personalizado' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Status' }), 'x')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByText('Emoji inválido')).toBeTruthy()
  })

  it('"Limpar status" só aparece com status ativo e manda null', async () => {
    socket.replyTo('account:update', () => ({ ok: true, account }))
    ui(<UserPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Status e conta' }))
    expect(screen.queryByRole('menuitem', { name: 'Limpar status' })).toBeNull()
    await userEvent.keyboard('{Escape}')

    act(() => useApp.setState({ account: { ...account, customStatus: playing } }))
    await userEvent.click(screen.getByRole('button', { name: 'Status e conta' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Limpar status' }))

    expect(socket.sent('account:update')[0][0]).toEqual({ customStatus: null })
  })
})
