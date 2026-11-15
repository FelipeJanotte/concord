// Navegação da barra de úteis (B7): seções, Home, conversas privadas e não lidos.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Channel, DmEntry, Message, User } from '@shared/types'
import { selectTextChannel } from '@/lib/actions/channels'
import { bindMessageEvents } from '@/lib/actions/messages'
import {
  isChatOnScreen,
  messageAccount,
  openDmChat,
  openTool,
  showCommunity,
  showFriends,
  showHome
} from '@/lib/actions/navigation'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const dmChannel: Channel = { id: 'dm-ana', name: 'dm', type: 'dm', createdAt: 0 }
const dm: DmEntry = { channel: dmChannel, other: { id: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null } }
const msg = (channelId: string, author = ana): Message => ({
  id: `m-${Math.random()}`,
  channelId,
  author,
  content: 'oi',
  attachments: [],
  createdAt: 0
})

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindMessageEvents(socket.asSocket())
  socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
  useApp.setState({ ...initialState, self: me, channels: [geral], dms: [dm], view: { kind: 'text', channelId: 'geral' } })
})

afterEach(() => setSocket(null))

describe('seções', () => {
  it('começa na comunidade; Home mostra "Amigos" e volta para a comunidade no mesmo canal', () => {
    expect(useApp.getState().section).toBe('community')
    showHome()
    expect(useApp.getState()).toMatchObject({ section: 'home', homeView: { kind: 'friends' } })
    showCommunity()
    expect(useApp.getState()).toMatchObject({ section: 'community', view: { kind: 'text', channelId: 'geral' } })
  })

  it('abrir uma conversa: Home com o chat, limpa o não lido e busca o histórico uma vez', async () => {
    useApp.setState({ unread: { 'dm-ana': true } })
    openDmChat('dm-ana')
    expect(useApp.getState()).toMatchObject({ section: 'home', homeView: { kind: 'dm', channelId: 'dm-ana' } })
    expect(useApp.getState().unread['dm-ana']).toBeUndefined()
    await Promise.resolve()
    expect(socket.sent('message:history')).toEqual([[{ channelId: 'dm-ana' }]])
  })

  it('a Home lembra a última conversa; "Amigos" volta para a lista', () => {
    openDmChat('dm-ana')
    showCommunity()
    showHome()
    expect(useApp.getState().homeView).toEqual({ kind: 'dm', channelId: 'dm-ana' })
    showFriends()
    expect(useApp.getState().homeView).toEqual({ kind: 'friends' })
  })

  it('ferramenta: seção própria; escolher canal ou voltar à comunidade fecha a ferramenta', () => {
    openTool('sorteador')
    expect(useApp.getState()).toMatchObject({ section: 'tool', toolId: 'sorteador' })
    selectTextChannel('geral')
    expect(useApp.getState()).toMatchObject({ section: 'community', toolId: null })
  })
})

describe('"Mensagem"', () => {
  it('abre (ou cria) a conversa no servidor e mostra o chat', async () => {
    socket.replyTo('dm:open', () => ({ ok: true, dm }))
    useApp.setState({ dms: [] })
    await messageAccount('acc-ana')
    expect(socket.sent('dm:open')[0][0]).toBe('acc-ana')
    expect(useApp.getState().dms).toEqual([dm])
    expect(useApp.getState().homeView).toEqual({ kind: 'dm', channelId: 'dm-ana' })
  })

  it('erro do servidor vira exceção e não muda a tela', async () => {
    socket.replyTo('dm:open', () => ({ ok: false, error: 'Vocês precisam ser amigos para conversar' }))
    await expect(messageAccount('acc-ana')).rejects.toThrow('Vocês precisam ser amigos para conversar')
    expect(useApp.getState().section).toBe('community')
  })
})

describe('não lidos', () => {
  it('mensagem na conversa aberta não marca; na comunidade ou em outra seção, marca', () => {
    openDmChat('dm-ana')
    socket.receive('message:new', msg('dm-ana'))
    socket.receive('message:new', msg('geral'))
    expect(useApp.getState().unread).toEqual({ geral: true })

    showCommunity()
    socket.receive('message:new', msg('dm-ana'))
    expect(useApp.getState().unread).toEqual({ 'dm-ana': true })
  })

  it('isChatOnScreen olha a seção, não só o último canal', () => {
    const st = useApp.getState()
    expect(isChatOnScreen(st, 'geral')).toBe(true)
    expect(isChatOnScreen({ ...st, section: 'home' }, 'geral')).toBe(false)
    expect(isChatOnScreen({ ...st, section: 'tool' }, 'geral')).toBe(false)
  })
})
