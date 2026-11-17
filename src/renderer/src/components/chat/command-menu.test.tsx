// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessState, Channel, User } from '@shared/types'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { Composer } from './Composer'

const channel: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const user = (accountId: string, name: string): User => ({ id: `sock-${name}`, accountId, name, tag: name.toLowerCase(), color: '#fff', avatarUrl: null })
const me = user('aaaaaaaa-0000-0000-0000-000000000001', 'Eu')
const ana = user('aaaaaaaa-0000-0000-0000-000000000002', 'Ana')
const access = {
  ownerAccountId: 'acc-dona',
  roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: ['view', 'send'] }],
  members: [],
  overrides: []
} as unknown as AccessState

let socket: FakeSocket

const box = (): HTMLTextAreaElement => screen.getByPlaceholderText('Conversar em #geral')
const menu = (): HTMLElement | null => screen.queryByRole('listbox', { name: 'Comandos' })
const items = (): string[] => within(menu()!).getAllByRole('option').map((o) => o.querySelector('code')?.textContent ?? '')
const selected = (): string | null | undefined => within(menu()!).getByRole('option', { selected: true }).querySelector('code')?.textContent

beforeEach(() => {
  useApp.setState({ ...initialState, self: me, users: [me, ana], channels: [channel], access, myVoiceChannelId: 'sala' })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  render(<Composer channel={channel} />)
})

afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('menu de comandos no Composer', () => {
  it('"/" mostra todos os comandos com o argumento e a descrição', async () => {
    await userEvent.type(box(), '/')
    expect(items()).toEqual(['/play', '/skip', '/stop', '/queue'])
    const play = within(menu()!).getAllByRole('option')[0]
    expect(within(play).getByText('query')).toBeTruthy()
    expect(within(play).getByText('Toca uma música ou playlist do Spotify/YouTube, ou busca pelo nome')).toBeTruthy()
    expect(within(menu()!).getByText('Pula a música atual')).toBeTruthy()
  })

  it('filtra enquanto digita e some sem correspondência', async () => {
    await userEvent.type(box(), '/sk')
    expect(items()).toEqual(['/skip'])
    await userEvent.type(box(), 'x')
    expect(menu()).toBeNull()
  })

  it('seta para baixo e Enter completam (com espaço) em vez de enviar', async () => {
    await userEvent.type(box(), '/s')
    expect(selected()).toBe('/skip')
    await userEvent.keyboard('{ArrowDown}')
    expect(selected()).toBe('/stop')
    await userEvent.keyboard('{Enter}')
    expect(box().value).toBe('/stop ')
    expect(menu()).toBeNull()
    expect(socket.emitted).toEqual([])
  })

  it('Tab completa /play e mantém a dica "query"; com o argumento, Enter envia', async () => {
    socket.replyTo('music:play', () => ({ ok: false, error: 'qualquer' }))
    await userEvent.type(box(), '/pl')
    await userEvent.keyboard('{Tab}')
    expect(box().value).toBe('/play ')
    expect(within(screen.getByTestId('command-highlight')).getByText('query')).toBeTruthy()
    await userEvent.type(box(), 'lofi{Enter}')
    expect(socket.sent('music:play')).toEqual([[{ channelId: 'sala', query: 'lofi', textChannelId: 'geral' }]])
  })

  it('clique completa', async () => {
    await userEvent.type(box(), '/')
    await userEvent.pointer({ keys: '[MouseLeft>]', target: within(menu()!).getByText('/queue') })
    expect(box().value).toBe('/queue ')
  })

  it('Esc fecha e digitar de novo reabre', async () => {
    await userEvent.type(box(), '/')
    await userEvent.keyboard('{Escape}')
    expect(menu()).toBeNull()
    await userEvent.type(box(), 'q')
    expect(items()).toEqual(['/queue'])
  })

  it('não aparece com "/" no meio do texto', async () => {
    await userEvent.type(box(), 'oi /play')
    expect(menu()).toBeNull()
  })

  it('não interfere no menu de menções', async () => {
    await userEvent.type(box(), '@A')
    expect(menu()).toBeNull()
    expect(screen.getByRole('listbox', { name: 'Mencionar' })).toBeTruthy()
    await userEvent.clear(box())
    await userEvent.type(box(), '/')
    expect(screen.queryByRole('listbox', { name: 'Mencionar' })).toBeNull()
    expect(menu()).toBeTruthy()
  })
})
