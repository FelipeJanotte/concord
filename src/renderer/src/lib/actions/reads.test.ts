import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Channel, ChannelReadState, DmEntry, Message, User } from '@shared/types'
import { selectTextChannel } from '@/lib/actions/channels'
import { bindMessageEvents } from '@/lib/actions/messages'
import { openDmChat, showFriends } from '@/lib/actions/navigation'
import { bindReadsEvents, loadReads } from '@/lib/actions/reads'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const jogos: Channel = { id: 'jogos', name: 'jogos', type: 'text', createdAt: 0 }
const dmChannel: Channel = { id: 'dm-ana', name: 'dm', type: 'dm', createdAt: 0 }
const dm: DmEntry = { channel: dmChannel, other: { id: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null } }
const msg = (id: string, channelId: string, author = ana): Message => ({ id, channelId, author, content: id, attachments: [], createdAt: 0 })
const state = (channelId: string, lastReadId: string | null, unread: boolean): ChannelReadState => ({ channelId, lastReadId, unread })
const flush = () => new Promise((r) => setTimeout(r, 0))

let socket: FakeSocket
let history: Record<string, Message[]>

beforeEach(() => {
  socket = new FakeSocket()
  history = {}
  setSocket(socket.asSocket())
  bindMessageEvents(socket.asSocket())
  bindReadsEvents(socket.asSocket())
  socket.replyTo('message:history', (p) => ({ messages: history[(p as { channelId: string }).channelId] ?? [], hasMore: false }))
  socket.replyTo('channel:read', () => ({ ok: true }))
  useApp.setState({ ...initialState, self: me, channels: [geral, jogos], dms: [dm], view: { kind: 'text', channelId: 'geral' } })
})

afterEach(() => setSocket(null))

describe('loadReads', () => {
  it('traz o não lido e o ponto de leitura guardados no servidor; canal silenciado não fica não lido', async () => {
    useApp.setState({ mutedChannels: ['jogos'], view: null })
    socket.replyTo('channel:reads', () => [state('geral', 'g1', true), state('jogos', null, true), state('dm-ana', 'd1', false)])
    await loadReads()
    expect(useApp.getState().unread).toEqual({ geral: true })
    expect(useApp.getState().lastRead).toEqual({ geral: 'g1', 'dm-ana': 'd1' })
  })

  it('não perde o que mudou enquanto a lista vinha', async () => {
    useApp.setState({ view: null, unread: { jogos: true }, lastRead: { geral: 'g9' } })
    socket.replyTo('channel:reads', () => [state('geral', 'g1', false), state('jogos', null, false)])
    await loadReads()
    expect(useApp.getState().unread).toEqual({ jogos: true })
    expect(useApp.getState().lastRead).toEqual({ geral: 'g9' })
  })

  it('o chat aberto com não lido: marca a linha "Novas mensagens" e lê até a última', async () => {
    history.geral = [msg('g1', 'geral'), msg('g2', 'geral')]
    socket.replyTo('channel:reads', () => [state('geral', 'g1', true)])
    await loadReads()
    await flush()
    expect(useApp.getState().unread.geral).toBeUndefined()
    expect(useApp.getState().readMarker).toEqual({ geral: 'g1' })
    expect(socket.sent('channel:read')).toEqual([[{ channelId: 'geral', messageId: 'g2' }, expect.any(Function)]])
  })
})

describe('abrir um chat', () => {
  it('com não lido: guarda onde parei para a linha e avisa o servidor da última mensagem', async () => {
    history['dm-ana'] = [msg('d1', 'dm-ana'), msg('d2', 'dm-ana')]
    useApp.setState({ unread: { 'dm-ana': true }, lastRead: { 'dm-ana': 'd1' } })
    openDmChat('dm-ana')
    await flush()
    expect(useApp.getState().unread['dm-ana']).toBeUndefined()
    expect(useApp.getState().readMarker['dm-ana']).toBe('d1')
    expect(useApp.getState().lastRead['dm-ana']).toBe('d2')
    expect(socket.sent('channel:read')).toEqual([[{ channelId: 'dm-ana', messageId: 'd2' }, expect.any(Function)]])
  })

  it('sem não lido: sem linha; já lido até a última não avisa de novo', async () => {
    history.jogos = [msg('j1', 'jogos')]
    useApp.setState({ lastRead: { jogos: 'j1' }, readMarker: { jogos: 'j0' } })
    selectTextChannel('jogos')
    await flush()
    expect(useApp.getState().readMarker.jogos).toBeUndefined()
    expect(socket.sent('channel:read')).toEqual([])
  })

  it('canal vazio não avisa', async () => {
    selectTextChannel('jogos')
    await flush()
    expect(socket.sent('channel:read')).toEqual([])
  })
})

describe('mensagem nova', () => {
  it('no chat que estou vendo: lê na hora', async () => {
    useApp.setState({ messages: { geral: [msg('g1', 'geral')] } })
    socket.receive('message:new', msg('g2', 'geral'))
    expect(socket.sent('channel:read')).toEqual([[{ channelId: 'geral', messageId: 'g2' }, expect.any(Function)]])
    expect(useApp.getState().lastRead.geral).toBe('g2')
  })

  it('em outro chat: fica não lido e não avisa', () => {
    showFriends()
    useApp.setState({ messages: { geral: [msg('g1', 'geral')] } })
    socket.receive('message:new', msg('g2', 'geral'))
    expect(useApp.getState().unread.geral).toBe(true)
    expect(socket.sent('channel:read')).toEqual([])
  })
})

describe('channel:read-sync', () => {
  it('li em outra janela: apaga o não lido aqui e anda o ponto de leitura', () => {
    useApp.setState({ unread: { jogos: true, geral: true } })
    socket.receive('channel:read-sync', { channelId: 'jogos', messageId: 'j5' })
    expect(useApp.getState().unread).toEqual({ geral: true })
    expect(useApp.getState().lastRead.jogos).toBe('j5')
  })
})

describe('menção não lida', () => {
  it('marca o canal quando a mensagem nova me menciona e limpa ao abrir', async () => {
    socket.receive('message:new', { ...msg('m1', 'jogos'), content: 'oi <@todos>' })
    socket.receive('message:new', msg('m2', 'jogos'))
    expect(useApp.getState().mentioned).toEqual({ jogos: true })
    selectTextChannel('jogos')
    await flush()
    expect(useApp.getState().mentioned).toEqual({})
  })

  it('não marca mensagem sem menção a mim', () => {
    socket.receive('message:new', { ...msg('m1', 'jogos'), content: 'oi <@00000000-0000-4000-8000-000000000001>' })
    expect(useApp.getState().mentioned).toEqual({})
  })

  it('outra janela que leu limpa a menção', () => {
    socket.receive('message:new', { ...msg('m1', 'jogos'), content: '<@todos>' })
    socket.receive('channel:read-sync', { channelId: 'jogos', messageId: 'm1' })
    expect(useApp.getState().mentioned).toEqual({})
  })
})
