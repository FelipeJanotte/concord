// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, DmEntry, Preferences, PreferencesUpdate, User } from '@shared/types'
import { DEFAULT_THEME } from '@shared/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { ChannelSidebar } from './ChannelSidebar'
import { DmList } from './dm/DmList'

const me: User = { id: 'eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#000', avatarUrl: null }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const sala: Channel = { id: 'sala', name: 'Jogos', type: 'voice', createdAt: 0 }
const dmAna: DmEntry = { channel: { id: 'dm-ana', name: 'dm', type: 'dm', createdAt: 0 }, other: { id: 'acc-ana', name: 'Ana', tag: 'ana', color: '#000', avatarUrl: null } }

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
  socket.replyTo('preferences:update', (u) => {
    const preferences: Preferences = { theme: DEFAULT_THEME, savedThemes: [], mutedChannels: (u as PreferencesUpdate).mutedChannels ?? [] }
    return { ok: true, preferences }
  })
  useApp.setState({ ...initialState, self: me, users: [me], channels: [geral, sala], dms: [dmAna], friendsLoaded: true, section: 'community' })
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.unstubAllGlobals()
})

function ui(node: React.ReactNode): void {
  render(<TooltipProvider>{node}</TooltipProvider>)
}

function openMenu(text: string): HTMLElement {
  fireEvent.contextMenu(screen.getByText(text))
  return screen.getByRole('menu')
}

const row = (text: string): HTMLElement => screen.getByText(text).closest('[data-muted]') as HTMLElement

describe('silenciar canal', () => {
  it('botão direito no canal de texto silencia: esmaece e guarda na conta', async () => {
    ui(<ChannelSidebar />)
    expect(row('geral').dataset.muted).toBe('false')
    await userEvent.click(within(openMenu('geral')).getByRole('menuitem', { name: 'Silenciar canal' }))
    expect(useApp.getState().mutedChannels).toEqual(['geral'])
    expect(row('geral').dataset.muted).toBe('true')
    expect(row('geral').className).toContain('opacity-50')
    expect(socket.sent('preferences:update').map((a) => a[0])).toEqual([{ mutedChannels: ['geral'] }])
  })

  it('canal silenciado mostra "Reativar canal", que tira o silêncio', async () => {
    useApp.setState({ mutedChannels: ['sala'] })
    ui(<ChannelSidebar />)
    expect(row('Jogos').dataset.muted).toBe('true')
    await userEvent.click(within(openMenu('Jogos')).getByRole('menuitem', { name: 'Reativar canal' }))
    expect(useApp.getState().mutedChannels).toEqual([])
    expect(row('Jogos').dataset.muted).toBe('false')
  })

  it('conversa privada: "Silenciar conversa" e "Reativar conversa"', async () => {
    ui(<DmList />)
    await userEvent.click(within(openMenu('Ana')).getByRole('menuitem', { name: 'Silenciar conversa' }))
    expect(useApp.getState().mutedChannels).toEqual(['dm-ana'])
    expect(row('Ana').dataset.muted).toBe('true')
    await userEvent.click(within(openMenu('Ana')).getByRole('menuitem', { name: 'Reativar conversa' }))
    expect(useApp.getState().mutedChannels).toEqual([])
  })
})
