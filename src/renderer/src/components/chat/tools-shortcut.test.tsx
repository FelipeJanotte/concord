// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessState, Channel, DmEntry, User } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { ToolView } from '@/components/tools/ToolView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const sala: Channel = { id: 'sala', name: 'sala', type: 'voice', createdAt: 0 }
const dmChannel: Channel = { id: 'dm-ana', name: 'dm', type: 'dm', createdAt: 0 }
const dm: DmEntry = { channel: dmChannel, other: { id: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null } }
const access = {
  ownerAccountId: 'acc-dona',
  roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'attach'] }],
  members: [],
  overrides: []
} as unknown as AccessState

function setup(channelId: string): void {
  useApp.setState({
    ...initialState,
    self: me,
    users: [me],
    channels: [geral, sala],
    dms: [dm],
    access,
    view: { kind: 'text', channelId: 'geral' },
    messages: { [channelId]: [] },
    hasMoreHistory: { [channelId]: false }
  })
  render(
    <TooltipProvider>
      <ChatView channelId={channelId} />
    </TooltipProvider>
  )
}

function showToolView(): void {
  cleanup()
  render(<ToolView />)
}

beforeEach(() => {
  setSocket(new FakeSocket().asSocket())
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

describe('atalho das ferramentas no composer', () => {
  it('o + lista as ferramentas do registro', async () => {
    setup('geral')
    await userEvent.click(screen.getByRole('button', { name: 'Ferramentas' }))
    const names = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(names).toEqual(['Sorteador de times', 'Dado', 'Cara ou coroa', 'Sortear 1', 'Enquete'])
  })

  it('escolher uma abre o painel da ferramenta postando no canal atual', async () => {
    setup('geral')
    await userEvent.click(screen.getByRole('button', { name: 'Ferramentas' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dado' }))
    expect(useApp.getState()).toMatchObject({ section: 'tool', toolId: 'dice' })
    showToolView()
    expect(screen.getByRole('heading', { name: 'Dado' })).toBeTruthy()
    expect((screen.getByLabelText('Postar em') as HTMLSelectElement).value).toBe('geral')
  })

  it('numa conversa privada, o destino é a conversa (mesmo com um canal aberto na comunidade)', async () => {
    setup('dm-ana')
    await userEvent.click(screen.getByRole('button', { name: 'Ferramentas' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Enquete' }))
    showToolView()
    expect((screen.getByLabelText('Postar em') as HTMLSelectElement).value).toBe('dm-ana')
  })

  it('no chat da sala de voz não aparece (ferramenta não posta em sala de voz)', () => {
    setup('sala')
    expect(screen.queryByRole('button', { name: 'Ferramentas' })).toBeNull()
  })
})
