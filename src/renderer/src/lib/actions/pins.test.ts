import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message, User } from '@shared/types'
import { bindModerationEvents } from '@/lib/actions/moderation'
import { bindPinsEvents, loadPins, pinMessage } from '@/lib/actions/pins'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const msg = (id: string, over: Partial<Message> = {}): Message => ({ id, channelId: 'geral', author: ana, content: id, attachments: [], createdAt: 1, ...over })

let socket: FakeSocket
const st = () => useApp.getState()

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindPinsEvents(socket.asSocket())
  bindModerationEvents(socket.asSocket())
  useApp.setState({ ...initialState, messages: { geral: [msg('m1'), msg('m2')] } })
})
afterEach(() => setSocket(null))

describe('fixar no app', () => {
  it('loadPins guarda a lista do canal', async () => {
    socket.replyTo('message:pins', () => [msg('m2', { pinnedAt: 5 })])
    await loadPins('geral')
    expect(socket.sent('message:pins')[0][0]).toEqual({ channelId: 'geral' })
    expect(st().pins.geral.map((m) => m.id)).toEqual(['m2'])
  })

  it('pinMessage manda o pedido e lança o erro do servidor', async () => {
    socket.replyTo('message:pin', () => ({ ok: false, error: 'Você não tem permissão para fixar mensagens' }))
    await expect(pinMessage('m1', true)).rejects.toThrow('Você não tem permissão para fixar mensagens')
    expect(socket.sent('message:pin')[0][0]).toEqual({ messageId: 'm1', on: true })
  })

  it('message:pinned marca a mensagem carregada e põe no topo da lista', () => {
    useApp.setState({ pins: { geral: [msg('m2', { pinnedAt: 5 })] } })
    socket.receive('message:pinned', { channelId: 'geral', messageId: 'm1', pinnedAt: 9 })
    expect(st().messages.geral[0].pinnedAt).toBe(9)
    expect(st().pins.geral.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('fixada que não está carregada: a lista em cache é descartada para buscar de novo', () => {
    useApp.setState({ pins: { geral: [] } })
    socket.receive('message:pinned', { channelId: 'geral', messageId: 'longe', pinnedAt: 9 })
    expect(st().pins.geral).toBeUndefined()
  })

  it('desafixar e apagar tiram da lista e da marca', () => {
    useApp.setState({ messages: { geral: [msg('m1', { pinnedAt: 3 }), msg('m2', { pinnedAt: 4 })] }, pins: { geral: [msg('m2', { pinnedAt: 4 }), msg('m1', { pinnedAt: 3 })] } })
    socket.receive('message:pinned', { channelId: 'geral', messageId: 'm1', pinnedAt: null })
    expect(st().messages.geral[0].pinnedAt).toBeUndefined()
    expect(st().pins.geral.map((m) => m.id)).toEqual(['m2'])
    socket.receive('message:deleted', { channelId: 'geral', messageId: 'm2' })
    expect(st().pins.geral).toEqual([])
  })
})
