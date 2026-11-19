// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessState, Channel, Message, User } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const msg = (id: string): Message => ({ id, channelId: 'geral', author: ana, content: `texto ${id}`, attachments: [], createdAt: 1 })
const access = {
  ownerAccountId: 'acc-dona',
  roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: ['view', 'send'] }],
  members: [],
  overrides: []
} as unknown as AccessState

function setup(readMarker: Record<string, string>): void {
  useApp.setState({
    ...initialState,
    self: me,
    users: [me, ana],
    channels: [geral],
    access,
    messages: { geral: [msg('m1'), msg('m2'), msg('m3')] },
    hasMoreHistory: { geral: false },
    readMarker
  })
  render(
    <TooltipProvider>
      <ChatView channelId="geral" />
    </TooltipProvider>
  )
}

beforeEach(() => setSocket(new FakeSocket().asSocket()))
afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('linha "Novas mensagens"', () => {
  it('aparece logo depois da última mensagem que eu tinha lido', () => {
    setup({ geral: 'm1' })
    const line = screen.getByRole('separator', { name: 'Novas mensagens' })
    const following = (el: Element, text: string) => el.compareDocumentPosition(screen.getByText(text)) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(following(line, 'texto m2')).toBeTruthy()
    expect(following(screen.getByText('texto m1'), 'texto m2')).toBeTruthy()
    expect(screen.getByText('texto m1').compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('não aparece sem ponto de leitura, com a última mensagem lida ou com uma mensagem que não está carregada', () => {
    setup({})
    expect(screen.queryByRole('separator', { name: 'Novas mensagens' })).toBeNull()
    cleanup()
    setup({ geral: 'm3' })
    expect(screen.queryByRole('separator', { name: 'Novas mensagens' })).toBeNull()
    cleanup()
    setup({ geral: 'antiga' })
    expect(screen.queryByRole('separator', { name: 'Novas mensagens' })).toBeNull()
  })
})
