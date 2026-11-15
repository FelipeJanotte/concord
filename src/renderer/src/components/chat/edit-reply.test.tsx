// @vitest-environment jsdom
// Editar (A15) e responder citando (B18) na tela: barra de ações, edição no lugar, "(editada)",
// citação que rola até a original e a faixa "Respondendo a" no campo.
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessState, Channel, Message, User } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const msg = (id: string, author: User, content: string, over: Partial<Message> = {}): Message => ({ id, channelId: 'geral', author, content, attachments: [], createdAt: 1, ...over })
/** @todos pode ver e mandar, sem manageMessages; a dona é outra conta */
const access = {
  ownerAccountId: 'acc-dona',
  roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'attach'] }],
  members: [],
  overrides: []
} as unknown as AccessState

let socket: FakeSocket

function setup(messages: Message[]): void {
  useApp.setState({ ...initialState, self: me, users: [me, ana], channels: [geral], access, messages: { geral: messages }, hasMoreHistory: { geral: false } })
  render(
    <TooltipProvider>
      <ChatView channelId="geral" />
    </TooltipProvider>
  )
}
const item = (text: string) => screen.getByText(text).closest('[id^="msg-"]') as HTMLElement

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})
afterEach(() => {
  cleanup()
  setSocket(null)
  vi.useRealTimers()
})

describe('barra de ações', () => {
  it('na minha: responder, editar e apagar; na dos outros (sem moderação): só responder', () => {
    setup([msg('m1', ana, 'da ana'), msg('m2', me, 'minha')])
    const mine = within(item('minha'))
    expect(mine.getByRole('button', { name: 'Responder' })).toBeTruthy()
    expect(mine.getByRole('button', { name: 'Editar mensagem' })).toBeTruthy()
    expect(mine.getByRole('button', { name: 'Apagar mensagem' })).toBeTruthy()
    const other = within(item('da ana'))
    expect(other.getByRole('button', { name: 'Responder' })).toBeTruthy()
    expect(other.queryByRole('button', { name: 'Editar mensagem' })).toBeNull()
    expect(other.queryByRole('button', { name: 'Apagar mensagem' })).toBeNull()
  })
})

describe('editar no lugar', () => {
  it('Editar abre o campo com o texto; Enter salva e aparece "(editada)"', async () => {
    socket.replyTo('message:edit', () => ({ ok: true }))
    setup([msg('m2', me, 'minha')])
    await userEvent.click(within(item('minha')).getByRole('button', { name: 'Editar mensagem' }))
    const box = screen.getByLabelText('Editando a mensagem') as HTMLTextAreaElement
    expect(box.value).toBe('minha')
    await userEvent.clear(box)
    await userEvent.type(box, 'minha corrigida{Enter}')
    expect(socket.sent('message:edit')[0][0]).toEqual({ messageId: 'm2', content: 'minha corrigida' })
    expect(await screen.findByText('(editada)')).toBeTruthy()
    expect(screen.queryByLabelText('Editando a mensagem')).toBeNull()
  })

  it('Esc cancela sem pedir ao servidor; erro aparece embaixo do campo', async () => {
    socket.replyTo('message:edit', () => ({ ok: false, error: 'Muitas mensagens seguidas. Espere um pouco.' }))
    setup([msg('m2', me, 'minha')])
    await userEvent.click(within(item('minha')).getByRole('button', { name: 'Editar mensagem' }))
    await userEvent.type(screen.getByLabelText('Editando a mensagem'), '!{Escape}')
    expect(screen.queryByLabelText('Editando a mensagem')).toBeNull()
    expect(socket.sent('message:edit')).toHaveLength(0)
    await userEvent.click(within(item('minha')).getByRole('button', { name: 'Editar mensagem' }))
    await userEvent.type(screen.getByLabelText('Editando a mensagem'), '!{Enter}')
    expect((await screen.findByRole('alert')).textContent).toBe('Muitas mensagens seguidas. Espere um pouco.')
  })

  it('seta para cima no campo vazio abre a minha última mensagem', async () => {
    setup([msg('m1', me, 'primeira'), msg('m2', me, 'última')])
    await userEvent.click(screen.getByPlaceholderText('Conversar em #geral'))
    await userEvent.keyboard('{ArrowUp}')
    expect((screen.getByLabelText('Editando a mensagem') as HTMLTextAreaElement).value).toBe('última')
  })

  it('mensagem editada antes mostra "(editada)" com a hora no título', () => {
    setup([msg('m2', ana, 'velha', { editedAt: Date.UTC(2026, 0, 2, 15, 30) })])
    expect(screen.getByText('(editada)').getAttribute('title')).toMatch(/^Editada em /)
  })
})

describe('responder citando', () => {
  it('Responder mostra a faixa no campo; enviar leva a resposta e some a faixa; X cancela', async () => {
    setup([msg('m1', ana, 'pergunta da ana')])
    await userEvent.click(within(item('pergunta da ana')).getByRole('button', { name: 'Responder' }))
    const banner = screen.getByRole('status')
    expect(banner.textContent).toContain('Respondendo a Ana')
    const box = screen.getByPlaceholderText('Conversar em #geral')
    expect(document.activeElement).toBe(box)
    await userEvent.type(box, 'resposta{Enter}')
    expect(socket.sent('message:send')[0][0]).toEqual({ channelId: 'geral', content: 'resposta', replyToId: 'm1' })
    expect(screen.queryByText(/Respondendo a/)).toBeNull()
    await userEvent.click(within(item('pergunta da ana')).getByRole('button', { name: 'Responder' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar resposta' }))
    expect(screen.queryByText(/Respondendo a/)).toBeNull()
  })

  it('Esc no campo cancela a resposta', async () => {
    setup([msg('m1', ana, 'pergunta da ana')])
    await userEvent.click(within(item('pergunta da ana')).getByRole('button', { name: 'Responder' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText(/Respondendo a/)).toBeNull()
  })

  it('a citação aparece em cima da resposta e clicar rola até a original (piscando)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    setup([
      msg('m1', ana, 'pergunta da ana'),
      msg('m2', me, 'resposta', { replyTo: { id: 'm1', authorName: 'Ana', authorAccountId: 'acc-ana', content: 'pergunta da ana' } })
    ])
    const quote = screen.getByTitle('Ir para a mensagem')
    expect(quote.textContent).toContain('@Ana')
    await userEvent.click(quote)
    expect(scroll).toHaveBeenCalled()
    expect(document.getElementById('msg-m1')?.dataset.highlight).toBe('true')
    act(() => vi.advanceTimersByTime(1600))
    expect(document.getElementById('msg-m1')?.dataset.highlight).toBeUndefined()
  })

  it('original apagada: "Mensagem apagada"', () => {
    setup([msg('m2', me, 'resposta', { replyTo: { id: 'm1', authorName: '', authorAccountId: null, content: '', deleted: true } })])
    expect(screen.getByText('Mensagem apagada')).toBeTruthy()
  })
})
