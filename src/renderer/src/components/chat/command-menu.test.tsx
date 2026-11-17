// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const box = (): HTMLTextAreaElement => screen.getByRole('textbox', { name: 'Conversar em #geral' })
const block = (): HTMLElement | null => screen.queryByTestId('command-block')
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

  it('Tab completa /play no bloco "query"; com o argumento, Enter envia', async () => {
    socket.replyTo('music:play', () => ({ ok: false, error: 'qualquer' }))
    await userEvent.type(box(), '/pl')
    await userEvent.keyboard('{Tab}')
    expect(within(block()!).getByText('query')).toBeTruthy()
    expect(box().value).toBe('')
    expect(document.activeElement).toBe(box())
    await userEvent.type(box(), 'lofi{Enter}')
    expect(socket.sent('music:play')).toEqual([[{ channelId: 'sala', query: 'lofi', textChannelId: 'geral' }]])
  })

  it('clique completa', async () => {
    await userEvent.type(box(), '/')
    await userEvent.pointer({ keys: '[MouseLeft>]', target: within(menu()!).getByText('/queue') })
    expect(box().value).toBe('/queue ')
    expect(block()).toBeNull()
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

describe('bloco do argumento do /play no Composer', () => {
  const precedes = (a: Node, b: Node): boolean => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('"/play " vira o bloco "query" e o campo, à direita dele, fica vazio com a dica', async () => {
    await userEvent.type(box(), '/play ')
    expect(within(block()!).getByText('/play')).toBeTruthy()
    expect(within(block()!).getByText('query')).toBeTruthy()
    expect(precedes(block()!, box())).toBe(true)
    expect(box().value).toBe('')
    expect(box().placeholder).toBe('link do Spotify/YouTube ou nome da música')
    expect(document.activeElement).toBe(box())
    expect(screen.queryByTestId('command-highlight')).toBeNull()
  })

  it('digitar põe o texto no campo, à direita do bloco, que continua como rótulo', async () => {
    await userEvent.type(box(), '/play lofi beats')
    expect(box().value).toBe('lofi beats')
    expect(within(block()!).getByText('query')).toBeTruthy()
  })

  it('Backspace no campo vazio desfaz o bloco e volta para "/play"', async () => {
    await userEvent.type(box(), '/play a')
    await userEvent.keyboard('{Backspace}')
    expect(block()).toBeTruthy()
    await userEvent.keyboard('{Backspace}')
    expect(block()).toBeNull()
    expect(box().value).toBe('/play')
    expect(box().selectionStart).toBe(5)
    await userEvent.keyboard('{Backspace}')
    expect(box().value).toBe('/pla')
  })

  it('Enter envia "/play <argumento>" e limpa tudo no sucesso', async () => {
    socket.replyTo('music:play', () => ({ ok: true, added: 1, state: { channelId: 'sala', nowPlaying: null, queue: [] } }))
    await userEvent.type(box(), '/play lofi{Enter}')
    expect(socket.sent('music:play')).toEqual([[{ channelId: 'sala', query: 'lofi', textChannelId: 'geral' }]])
    await waitFor(() => expect(block()).toBeNull())
    expect(box().value).toBe('')
  })

  it('Shift+Enter quebra a linha dentro do argumento', async () => {
    await userEvent.type(box(), '/play a{Shift>}{Enter}{/Shift}b')
    expect(box().value).toBe('a\nb')
    expect(socket.sent('music:play')).toEqual([])
  })

  it('menção no argumento abre o menu e completa no campo', async () => {
    await userEvent.type(box(), '/play @A')
    expect(screen.getByRole('listbox', { name: 'Mencionar' })).toBeTruthy()
    await userEvent.keyboard('{Enter}')
    expect(box().value).toBe('@Ana ')
    expect(block()).toBeTruthy()
  })

  it('colar imagem no argumento vai para os anexos, não para o texto', () => {
    useApp.setState({ access: { ...access, roles: [{ ...access.roles[0], permissions: ['view', 'send', 'attach'] }] } })
    fireEvent.change(box(), { target: { value: '/play ' } })
    const png = new File(['x'], 'print.png', { type: 'image/png' })
    fireEvent.paste(box(), { clipboardData: { files: [png] } })
    expect(useApp.getState().notice?.text).toBe('Sem conexão com o servidor')
    expect(box().value).toBe('')
  })
})
