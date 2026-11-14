// Ações e listeners do app (lib/actions/*) atualizando a store.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, Message, User } from '@shared/types'
import { bindAccountEvents, resolveAvatarUrl, updateProfile } from '@/lib/actions/account'
import { bindChannelEvents, createChannel, deleteChannel, firstTextView, selectTextChannel } from '@/lib/actions/channels'
import { bindMessageEvents, loadHistory, notifyTyping, sendMessage } from '@/lib/actions/messages'
import { bindPresenceEvents } from '@/lib/actions/presence'
import { bindVoiceEvents } from '@/lib/actions/voice'
import { notify, requireSocket, setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const user = (id: string, accountId = `acc-${id}`, name = `Pessoa ${id}`): User => ({
  id,
  accountId,
  name,
  tag: id.slice(0, 5),
  color: '#5865f2',
  avatarUrl: null
})

const channel = (id: string, type: 'text' | 'voice' = 'text'): Channel => ({ id, name: id, type, createdAt: 0 })

const message = (id: string, channelId: string, author: User): Message => ({
  id,
  channelId,
  author,
  content: `msg ${id}`,
  createdAt: 0
})

const me = user('eu', 'acc-eu', 'Eu')
let socket: FakeSocket

beforeEach(() => {
  useApp.setState({ ...initialState })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  for (const bind of [bindAccountEvents, bindPresenceEvents, bindChannelEvents, bindMessageEvents, bindVoiceEvents]) {
    bind(socket.asSocket())
  }
  useApp.setState({
    self: me,
    users: [me],
    channels: [channel('geral'), channel('outro'), channel('voz', 'voice')],
    view: { kind: 'text', channelId: 'geral' }
  })
})

afterEach(() => {
  setSocket(null)
  vi.useRealTimers()
})

describe('store', () => {
  it('initialState junta todos os slices com valores neutros', () => {
    expect(initialState).toMatchObject({
      status: 'disconnected',
      self: null,
      channels: [],
      messages: {},
      voice: [],
      myVoiceChannelId: null,
      notice: null
    })
  })
})

describe('core', () => {
  it('requireSocket falha sem conexão', () => {
    setSocket(null)
    expect(() => requireSocket()).toThrow('Sem conexão com o servidor')
  })

  it('notify mostra um aviso', () => {
    notify('deu ruim')
    expect(useApp.getState().notice).toMatchObject({ text: 'deu ruim', kind: 'error' })
    notify('tudo certo', 'info')
    expect(useApp.getState().notice).toMatchObject({ text: 'tudo certo', kind: 'info' })
  })
})

describe('presença', () => {
  it('user:joined adiciona sem duplicar e user:left remove', () => {
    const b = user('b')
    socket.receive('user:joined', b)
    socket.receive('user:joined', b)
    expect(useApp.getState().users.map((u) => u.id)).toEqual(['eu', 'b'])
    socket.receive('user:left', 'b')
    expect(useApp.getState().users.map((u) => u.id)).toEqual(['eu'])
  })
})

describe('conta', () => {
  it('user:updated muda todas as conexões da conta, self e account', () => {
    const otherTab = user('eu-2', 'acc-eu', 'Eu')
    useApp.setState({
      users: [me, otherTab, user('b')],
      account: { ...me, id: 'acc-eu', email: 'eu@x.com', hasPassword: true, hasGoogle: false, tagLocked: true }
    })
    socket.receive('user:updated', { accountId: 'acc-eu', name: 'Novo', tag: 'eu', avatarUrl: '/avatars/acc-eu?v=1' })
    const st = useApp.getState()
    expect(st.users.filter((u) => u.name === 'Novo').map((u) => u.id)).toEqual(['eu', 'eu-2'])
    expect(st.users.find((u) => u.id === 'b')?.name).toBe('Pessoa b')
    expect(st.self?.name).toBe('Novo')
    expect(st.account).toMatchObject({ name: 'Novo', avatarUrl: '/avatars/acc-eu?v=1', email: 'eu@x.com' })
  })

  it('updateProfile grava a conta ou lança o erro do servidor', async () => {
    const account = { ...me, id: 'acc-eu', email: 'e@x.com', hasPassword: true, hasGoogle: false, tagLocked: true }
    socket.replyTo('account:update', () => ({ ok: true, account: { ...account, name: 'Outro' } }))
    await updateProfile({ name: 'Outro' })
    expect(useApp.getState().account?.name).toBe('Outro')

    socket.replyTo('account:update', () => ({ ok: false, error: 'Nome inválido' }))
    await expect(updateProfile({ name: 'x' })).rejects.toThrow('Nome inválido')
  })

  it('resolveAvatarUrl monta o endereço completo', () => {
    expect(resolveAvatarUrl('/avatars/a?v=1', 'http://host:3001/')).toBe('http://host:3001/avatars/a?v=1')
    expect(resolveAvatarUrl('https://cdn/x.png', 'http://host')).toBe('https://cdn/x.png')
    expect(resolveAvatarUrl(null, 'http://host')).toBeUndefined()
    expect(resolveAvatarUrl('/avatars/a', null)).toBeUndefined()
  })
})

describe('mensagens', () => {
  it('message:new só entra no histórico já carregado', () => {
    const b = user('b')
    socket.receive('message:new', message('1', 'geral', b))
    expect(useApp.getState().messages.geral).toBeUndefined()

    useApp.setState({ messages: { geral: [] } })
    socket.receive('message:new', message('2', 'geral', b))
    expect(useApp.getState().messages.geral.map((m) => m.id)).toEqual(['2'])
  })

  it('marca não lido em canal fechado, mas não para mensagem própria ou canal aberto', () => {
    const b = user('b')
    socket.receive('message:new', message('1', 'geral', b))
    socket.receive('message:new', message('2', 'outro', me))
    expect(useApp.getState().unread).toEqual({})
    socket.receive('message:new', message('3', 'outro', b))
    expect(useApp.getState().unread).toEqual({ outro: true })
  })

  it('"digitando" expira e some quando a pessoa envia', () => {
    const b = user('b')
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    socket.receive('typing', { channelId: 'geral', userId: 'b', name: 'Pessoa b' })
    expect(useApp.getState().typing.geral.b).toEqual({ name: 'Pessoa b', until: 1_003_500 })
    socket.receive('message:new', message('1', 'geral', b))
    expect(useApp.getState().typing.geral).toEqual({})
  })

  it('loadHistory pede uma vez só e guarda', async () => {
    const msgs = [message('1', 'outro', me)]
    socket.replyTo('message:history', () => msgs)
    await Promise.all([loadHistory('outro'), loadHistory('outro')])
    await loadHistory('outro')
    expect(socket.sent('message:history')).toEqual([['outro']])
    expect(useApp.getState().messages.outro).toEqual(msgs)
  })

  it('loadHistory avisa quando falha', async () => {
    await loadHistory('geral')
    expect(useApp.getState().notice?.text).toBe('Não foi possível carregar as mensagens')
  })

  it('sendMessage apara o texto e ignora vazio', () => {
    sendMessage('geral', '  oi  ')
    sendMessage('geral', '   ')
    expect(socket.sent('message:send')).toEqual([[{ channelId: 'geral', content: 'oi' }]])
  })

  it('notifyTyping envia no máximo 1 vez a cada 2,5 s', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000_000)
    notifyTyping('geral')
    notifyTyping('geral')
    vi.setSystemTime(10_002_000)
    notifyTyping('geral')
    vi.setSystemTime(10_002_600)
    notifyTyping('geral')
    expect(socket.sent('typing')).toHaveLength(2)
  })
})

describe('canais', () => {
  it('firstTextView escolhe o primeiro canal de texto', () => {
    expect(firstTextView([channel('v', 'voice'), channel('t')])).toEqual({ kind: 'text', channelId: 't' })
    expect(firstTextView([channel('v', 'voice')])).toBeNull()
  })

  it('channel:created adiciona o canal', () => {
    socket.receive('channel:created', channel('novo'))
    expect(useApp.getState().channels.map((c) => c.id)).toContain('novo')
  })

  it('channel:deleted do canal aberto troca a tela e limpa dados', () => {
    socket.replyTo('message:history', () => [])
    useApp.setState({ messages: { geral: [] }, unread: { geral: true } })
    socket.receive('channel:deleted', 'geral')
    const st = useApp.getState()
    expect(st.channels.map((c) => c.id)).toEqual(['outro', 'voz'])
    expect(st.view).toEqual({ kind: 'text', channelId: 'outro' })
    expect(st.messages.geral).toBeUndefined()
    expect(st.unread.geral).toBeUndefined()
    expect(socket.sent('message:history')).toEqual([['outro']])
  })

  it('channel:deleted da sala de voz atual sai da voz', () => {
    useApp.setState({ myVoiceChannelId: 'voz' })
    socket.receive('channel:deleted', 'voz')
    expect(useApp.getState().myVoiceChannelId).toBeNull()
  })

  it('selectTextChannel abre o canal, limpa o não lido e carrega o histórico', () => {
    socket.replyTo('message:history', () => [])
    useApp.setState({ unread: { outro: true } })
    selectTextChannel('outro')
    expect(useApp.getState().view).toEqual({ kind: 'text', channelId: 'outro' })
    expect(useApp.getState().unread).toEqual({})
    expect(socket.sent('message:history')).toEqual([['outro']])
  })

  it('createChannel devolve o canal ou lança o erro', async () => {
    socket.replyTo('channel:create', () => ({ ok: true, channel: channel('c') }))
    await expect(createChannel('c', 'text')).resolves.toEqual(channel('c'))
    socket.replyTo('channel:create', () => ({ ok: false, error: 'Já existe um canal com esse nome' }))
    await expect(createChannel('c', 'text')).rejects.toThrow('Já existe um canal com esse nome')
  })

  it('deleteChannel envia o id', () => {
    deleteChannel('outro')
    expect(socket.sent('channel:delete')).toEqual([['outro']])
  })
})

describe('voz', () => {
  it('voice:state substitui a lista inteira', () => {
    const states = [{ userId: 'b', channelId: 'voz', muted: true, deafened: false }]
    socket.receive('voice:state', states)
    expect(useApp.getState().voice).toEqual(states)
    socket.receive('voice:state', [])
    expect(useApp.getState().voice).toEqual([])
  })
})
