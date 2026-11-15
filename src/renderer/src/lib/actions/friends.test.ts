// Ações de amizades e conversas privadas (v3): listas na store, avisos do servidor e erros legíveis.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DmEntry, FriendAccount, FriendEntry, Message } from '@shared/types'
import {
  acceptFriend,
  bindFriendsEvents,
  blockAccount,
  declineFriend,
  loadFriendsAndDms,
  openDm,
  removeFriend,
  sendFriendRequest,
  unblockAccount
} from '@/lib/actions/friends'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const account = (id: string, name = id): FriendAccount => ({ id, name, tag: `${id}1`, color: '#5865f2', avatarUrl: null })
const entry = (id: string, status: FriendEntry['status'], online = false): FriendEntry => ({ account: account(id), status, since: 1, online })
const dm = (channelId: string, otherId: string): DmEntry => ({
  channel: { id: channelId, name: 'x'.repeat(32), type: 'dm', createdAt: 1 },
  other: account(otherId)
})
const message = (channelId: string): Message => ({
  id: `m-${channelId}`,
  channelId,
  author: { id: 's', accountId: 'b', name: 'B', tag: 'b1', color: '#000', avatarUrl: null },
  content: 'oi',
  attachments: [],
  createdAt: 2
})

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindFriendsEvents(socket.asSocket())
  useApp.setState({ ...initialState })
})

afterEach(() => setSocket(null))

describe('carregar', () => {
  it('começa vazio e marcado como não carregado', () => {
    expect(useApp.getState()).toMatchObject({ friends: [], dms: [], friendsLoaded: false })
  })

  it('loadFriendsAndDms pede friend:list e dm:list e guarda as duas listas', async () => {
    socket.replyTo('friend:list', () => [entry('a', 'friend', true)])
    socket.replyTo('dm:list', () => [dm('c1', 'a')])
    await loadFriendsAndDms()
    expect(useApp.getState()).toMatchObject({ friends: [entry('a', 'friend', true)], dms: [dm('c1', 'a')], friendsLoaded: true })
  })

  it('se a conexão mudou enquanto carregava, a resposta antiga é descartada', async () => {
    socket.replyTo('friend:list', () => {
      setSocket(new FakeSocket().asSocket())
      return [entry('a', 'friend')]
    })
    socket.replyTo('dm:list', () => [])
    await loadFriendsAndDms()
    expect(useApp.getState().friendsLoaded).toBe(false)
  })

  it('sem conexão não faz nada', async () => {
    setSocket(null)
    await expect(loadFriendsAndDms()).resolves.toBeUndefined()
  })
})

describe('avisos do servidor', () => {
  it('friend:updated acrescenta ou troca a relação; friend:removed tira', () => {
    socket.receive('friend:updated', entry('a', 'incoming'))
    socket.receive('friend:updated', entry('b', 'outgoing'))
    socket.receive('friend:updated', entry('a', 'friend', true))
    expect(useApp.getState().friends).toEqual([entry('a', 'friend', true), entry('b', 'outgoing')])
    socket.receive('friend:removed', 'b')
    expect(useApp.getState().friends).toEqual([entry('a', 'friend', true)])
  })

  it('friend:presence muda o online só de amigos', () => {
    useApp.setState({ friends: [entry('a', 'friend'), entry('b', 'outgoing')] })
    socket.receive('friend:presence', { accountId: 'a', online: true })
    socket.receive('friend:presence', { accountId: 'b', online: true })
    expect(useApp.getState().friends.map((e) => e.online)).toEqual([true, false])
  })

  it('dm:created põe a conversa no topo (sem duplicar)', () => {
    useApp.setState({ dms: [dm('c1', 'a')] })
    socket.receive('dm:created', dm('c2', 'b'))
    socket.receive('dm:created', dm('c2', 'b'))
    expect(useApp.getState().dms.map((d) => d.channel.id)).toEqual(['c2', 'c1'])
  })

  it('mensagem numa conversa a leva para o topo; mensagem de canal não mexe na lista', () => {
    useApp.setState({ dms: [dm('c1', 'a'), dm('c2', 'b')] })
    socket.receive('message:new', message('geral'))
    expect(useApp.getState().dms.map((d) => d.channel.id)).toEqual(['c1', 'c2'])
    socket.receive('message:new', message('c2'))
    expect(useApp.getState().dms.map((d) => d.channel.id)).toEqual(['c2', 'c1'])
  })
})

describe('ações', () => {
  it('sendFriendRequest manda o texto sem espaços nas pontas e devolve a relação', async () => {
    socket.replyTo('friend:request', () => ({ ok: true, entry: entry('a', 'outgoing') }))
    await expect(sendFriendRequest('  Ana#a1  ')).resolves.toEqual(entry('a', 'outgoing'))
    expect(socket.sent('friend:request')[0][0]).toBe('Ana#a1')
  })

  it('erro do servidor vira exceção com a mensagem dele', async () => {
    socket.replyTo('friend:request', () => ({ ok: false, error: 'Ninguém com esse nome#id' }))
    await expect(sendFriendRequest('X#y')).rejects.toThrow('Ninguém com esse nome#id')
  })

  it('aceitar, recusar, desfazer, bloquear e desbloquear mandam o id da conta', async () => {
    for (const ev of ['friend:accept', 'friend:decline', 'friend:remove', 'friend:block', 'friend:unblock'] as const) {
      socket.replyTo(ev, () => ({ ok: true, entry: null }))
    }
    await acceptFriend('a')
    await declineFriend('b')
    await removeFriend('c')
    await blockAccount('d')
    await unblockAccount('e')
    expect(
      (['friend:accept', 'friend:decline', 'friend:remove', 'friend:block', 'friend:unblock'] as const).map((ev) => socket.sent(ev)[0][0])
    ).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('openDm devolve a conversa e a põe no topo; erro vira exceção', async () => {
    useApp.setState({ dms: [dm('c1', 'a')] })
    socket.replyTo('dm:open', () => ({ ok: true, dm: dm('c2', 'b') }))
    await expect(openDm('b')).resolves.toEqual(dm('c2', 'b'))
    expect(useApp.getState().dms.map((d) => d.channel.id)).toEqual(['c2', 'c1'])
    socket.replyTo('dm:open', () => ({ ok: false, error: 'Vocês precisam ser amigos para conversar' }))
    await expect(openDm('z')).rejects.toThrow('Vocês precisam ser amigos para conversar')
  })
})
