// Notificações no app (B9): regras (quando avisar, texto, selo) e a ligação com os eventos
// (ponte e foco falsos): conversa privada, chamada, pedido de amizade, clique e selo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallInfo, DmEntry, FriendEntry, Message, User } from '@shared/types'
import type { NativeNotification, NotificationTarget } from '@shared/notifications'
import {
  bindNotificationEvents,
  loadNotificationPreferences,
  notificationEnv,
  openNotificationTarget,
  setChannelNotifications,
  setNotificationSound,
  setNotificationsEnabled,
  stopNotifications
} from '@/lib/actions/notifications'
import { setSocket } from '@/lib/core'
import { badgeCount, callNotification, friendRequestNotification, friendRequestSound, messageNotification, messagePreview, messageSound } from '@/lib/notifications'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const anaUser: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana1', color: '#fff', avatarUrl: null }
const dmAna: DmEntry = { channel: { id: 'dm-ana', name: 'dm', type: 'dm', createdAt: 0 }, other: { id: 'acc-ana', name: 'Ana', tag: 'ana1', color: '#fff', avatarUrl: null } }
const msg = (over: Partial<Message> = {}): Message => ({ id: 'm1', channelId: 'dm-ana', author: anaUser, content: 'oi, tudo bem?', attachments: [], createdAt: 1, ...over })
const ringing: CallInfo = { channelId: 'dm-ana', callerId: 'acc-ana', calleeId: 'acc-eu', status: 'ringing', since: 1 }
const request = (status: FriendEntry['status'] = 'incoming'): FriendEntry => ({ account: { id: 'acc-bia', name: 'Bia', tag: 'bia7', color: '#fff', avatarUrl: null }, status, since: 0, online: false })

const st = () => useApp.getState()

describe('regras', () => {
  beforeEach(() => useApp.setState({ ...initialState, self: me, dms: [dmAna] }))

  it('texto da mensagem: espaços juntos, corte em 120, anexo sem texto', () => {
    expect(messagePreview(msg({ content: ' oi \n  gente ' }))).toBe('oi gente')
    expect(messagePreview(msg({ content: 'a'.repeat(200) }))).toHaveLength(120)
    expect(messagePreview(msg({ content: '', attachments: [{}, {}] as never }))).toBe('📎 2 anexos')
    expect(messagePreview(msg({ content: '', kind: 'pin' }))).toBe('Fixou uma mensagem')
  })

  it('conversa privada fora de foco avisa e abre a conversa; com foco ou minha, não', () => {
    expect(messageNotification(msg(), st(), false)).toEqual({ title: 'Ana', body: 'oi, tudo bem?', target: { kind: 'dm', channelId: 'dm-ana' } })
    expect(messageNotification(msg(), st(), true)).toBeNull()
    expect(messageNotification(msg({ author: me }), st(), false)).toBeNull()
  })

  it('canal: toda mensagem por padrão; "só menções" e "nenhuma" filtram (conversa privada sempre avisa)', () => {
    useApp.setState({ channels: [{ id: 'geral', name: 'geral', type: 'text', createdAt: 0 }] })
    const plain = msg({ channelId: 'geral', content: 'bora jogar?' })
    const mention = msg({ channelId: 'geral', content: '<@todos> reunião' })
    expect(st().channelNotifications).toBe('all')
    expect(messageNotification(plain, st(), false)).toEqual({ title: 'Ana em #geral', body: 'bora jogar?', target: { kind: 'channel', channelId: 'geral' } })
    expect(messageNotification(plain, st(), true)).toBeNull()

    useApp.setState({ channelNotifications: 'mentions' })
    expect(messageNotification(plain, st(), false)).toBeNull()
    expect(messageNotification(mention, st(), false)?.body).toBe('@todos reunião')

    useApp.setState({ channelNotifications: 'none' })
    expect(messageNotification(mention, st(), false)).toBeNull()
    expect(messageNotification(msg(), st(), false)?.title).toBe('Ana')
  })

  it('canal ou conversa silenciados nunca avisam', () => {
    useApp.setState({ channels: [{ id: 'geral', name: 'geral', type: 'text', createdAt: 0 }], mutedChannels: ['geral', 'dm-ana'] })
    expect(messageNotification(msg({ channelId: 'geral', content: '<@todos> reunião' }), st(), false)).toBeNull()
    expect(messageNotification(msg(), st(), false)).toBeNull()
  })

  it('preferência salva nesta máquina; valor estranho no armazenamento volta ao padrão', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k)
    })
    setChannelNotifications('mentions')
    expect(st().channelNotifications).toBe('mentions')
    expect(JSON.parse(localStorage.getItem('concord:notifications') ?? '{}')).toEqual({
      channels: 'mentions',
      enabled: true,
      sounds: { dm: true, mention: true, friend: true }
    })
    useApp.setState({ channelNotifications: 'all' })
    loadNotificationPreferences()
    expect(st().channelNotifications).toBe('mentions')
    localStorage.setItem('concord:notifications', '{"channels":"qualquer"}')
    loadNotificationPreferences()
    expect(st().channelNotifications).toBe('all')
    localStorage.setItem('concord:notifications', 'não é json')
    loadNotificationPreferences()
    expect(st().channelNotifications).toBe('all')
    setChannelNotifications('qualquer' as never)
    expect(st().channelNotifications).toBe('all')
    vi.unstubAllGlobals()
  })

  it('chamada: só tocando para mim, sem som do sistema', () => {
    expect(callNotification(ringing, st(), false)).toMatchObject({ title: 'Ana está ligando', silent: true, target: { kind: 'dm', channelId: 'dm-ana' } })
    expect(callNotification({ ...ringing, status: 'active' }, st(), false)).toBeNull()
    expect(callNotification({ ...ringing, calleeId: 'acc-ana', callerId: 'acc-eu' }, st(), false)).toBeNull()
    expect(callNotification(ringing, st(), true)).toBeNull()
  })

  it('pedido de amizade recebido abre a tela de amigos', () => {
    expect(friendRequestNotification(request(), false)).toEqual({
      title: 'Pedido de amizade',
      body: 'Bia#bia7 enviou um pedido de amizade.',
      target: { kind: 'friends' }
    })
    expect(friendRequestNotification(request('friend'), false)).toBeNull()
    expect(friendRequestNotification(request(), true)).toBeNull()
  })

  it('som da mensagem: conversa privada e menção, cada um com seu interruptor; não na conversa que estou vendo', () => {
    useApp.setState({ channels: [{ id: 'geral', name: 'geral', type: 'text', createdAt: 0 }] })
    const mention = msg({ channelId: 'geral', content: '<@todos> olha' })
    expect(messageSound(msg(), st(), false)).toBe('dm')
    expect(messageSound(mention, st(), false)).toBe('mention')
    expect(messageSound(msg({ channelId: 'geral', content: 'bora jogar?' }), st(), false)).toBeNull()
    expect(messageSound(msg(), st(), true)).toBeNull()
    expect(messageSound(msg({ author: me }), st(), false)).toBeNull()

    useApp.setState({ channelNotifications: 'none' })
    expect(messageSound(mention, st(), false)).toBe('mention')

    useApp.setState({ notificationSounds: { dm: false, mention: true, friend: true } })
    expect(messageSound(msg(), st(), false)).toBeNull()
    expect(messageSound(mention, st(), false)).toBe('mention')
    useApp.setState({ notificationSounds: { dm: true, mention: false, friend: true } })
    expect(messageSound(mention, st(), false)).toBeNull()
  })

  it('som fica mudo com ensurdecer e em canal/conversa silenciados', () => {
    useApp.setState({ channels: [{ id: 'geral', name: 'geral', type: 'text', createdAt: 0 }] })
    const mention = msg({ channelId: 'geral', content: '<@todos> reunião' })
    useApp.setState({ mutedChannels: ['geral', 'dm-ana'] })
    expect(messageSound(msg(), st(), false)).toBeNull()
    expect(messageSound(mention, st(), false)).toBeNull()
    useApp.setState({ mutedChannels: [], deafened: true })
    expect(messageSound(msg(), st(), false)).toBeNull()
    expect(messageSound(mention, st(), false)).toBeNull()
    expect(friendRequestSound(request(), st())).toBeNull()
  })

  it('som do pedido de amizade: só pedido recebido e com o interruptor ligado', () => {
    expect(friendRequestSound(request(), st())).toBe('friend')
    expect(friendRequestSound(request('friend'), st())).toBeNull()
    useApp.setState({ notificationSounds: { dm: true, mention: true, friend: false } })
    expect(friendRequestSound(request(), st())).toBeNull()
  })

  it('interruptores salvos nesta máquina; valor estranho volta a ligado', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k)
    })
    setNotificationsEnabled(false)
    setNotificationSound('mention', false)
    expect(st()).toMatchObject({ notificationsEnabled: false, notificationSounds: { dm: true, mention: false, friend: true } })
    useApp.setState({ notificationsEnabled: true, notificationSounds: { dm: true, mention: true, friend: true } })
    loadNotificationPreferences()
    expect(st()).toMatchObject({ notificationsEnabled: false, notificationSounds: { dm: true, mention: false, friend: true } })
    localStorage.setItem('concord:notifications', '{"channels":"all","enabled":"não","sounds":{"dm":1,"friend":false}}')
    loadNotificationPreferences()
    expect(st()).toMatchObject({ notificationsEnabled: true, notificationSounds: { dm: true, mention: true, friend: false } })
    setNotificationSound('qualquer' as never, false)
    expect(st().notificationSounds).toEqual({ dm: true, mention: true, friend: false })
    vi.unstubAllGlobals()
  })

  it('selo: pedidos + conversas não lidas + chamada tocando para mim', () => {
    useApp.setState({ friends: [request()], unread: { 'dm-ana': true, geral: true }, calls: { 'dm-ana': ringing } })
    expect(badgeCount(st())).toBe(3)
  })
})

describe('ligação com os eventos', () => {
  let socket: FakeSocket
  let shown: NativeNotification[]
  let badges: Array<[number, string | null]>
  let clickListener: ((t: NotificationTarget | null) => void) | null
  let focused: boolean
  let played: string[]

  beforeEach(() => {
    played = []
    vi.spyOn(notificationEnv, 'playSound').mockImplementation((kind) => void played.push(kind))
    shown = []
    badges = []
    clickListener = null
    focused = false
    vi.spyOn(notificationEnv, 'isFocused').mockImplementation(() => focused)
    vi.spyOn(notificationEnv, 'bridge').mockReturnValue({
      show: (n) => shown.push(n),
      setBadge: (count, overlay) => badges.push([count, overlay]),
      onClick: (fn) => {
        clickListener = fn
        return () => (clickListener = null)
      }
    })
    useApp.setState({ ...initialState, self: me, dms: [dmAna] })
    socket = new FakeSocket()
    setSocket(socket.asSocket())
    bindNotificationEvents(socket.asSocket())
  })

  afterEach(() => {
    stopNotifications()
    setSocket(null)
    vi.restoreAllMocks()
  })

  it('mensagem, chamada e pedido viram notificação fora de foco; com foco, nada', () => {
    socket.receive('message:new', msg())
    socket.receive('call:updated', ringing)
    socket.receive('friend:updated', request())
    expect(shown.map((n) => n.title)).toEqual(['Ana', 'Ana está ligando', 'Pedido de amizade'])
    focused = true
    socket.receive('message:new', msg({ id: 'm2' }))
    expect(shown).toHaveLength(3)
  })

  it('notificações desligadas: nada aparece e o selo fica zerado', () => {
    setNotificationsEnabled(false)
    socket.receive('message:new', msg())
    socket.receive('call:updated', ringing)
    socket.receive('friend:updated', request())
    useApp.setState({ unread: { 'dm-ana': true }, friends: [request()] })
    expect(shown).toEqual([])
    expect(badges.at(-1)).toEqual([0, null])
    setNotificationsEnabled(true)
    expect(badges.at(-1)?.[0]).toBe(2)
  })

  it('som toca no lugar do som do sistema; com o som desligado, a notificação mantém o do sistema', () => {
    socket.receive('message:new', msg())
    expect(played).toEqual(['dm'])
    expect(shown.at(-1)).toMatchObject({ title: 'Ana', silent: true })
    useApp.setState({ notificationSounds: { dm: false, mention: true, friend: true } })
    socket.receive('message:new', msg({ id: 'm2' }))
    expect(played).toEqual(['dm'])
    expect(shown.at(-1)?.silent).toBeUndefined()
  })

  it('som com o app em foco, menos na conversa aberta; pedido toca uma vez', () => {
    focused = true
    socket.receive('message:new', msg())
    expect(played).toEqual(['dm'])
    useApp.setState({ section: 'home', homeView: { kind: 'dm', channelId: 'dm-ana' } })
    socket.receive('message:new', msg({ id: 'm2' }))
    expect(played).toEqual(['dm'])
    socket.receive('friend:updated', request())
    socket.receive('friend:updated', { ...request(), online: true })
    expect(played).toEqual(['dm', 'friend'])
    expect(shown).toEqual([])
  })

  it('som toca mesmo com as notificações desligadas', () => {
    setNotificationsEnabled(false)
    socket.receive('message:new', msg())
    expect(played).toEqual(['dm'])
    expect(shown).toEqual([])
  })

  it('o mesmo pedido não avisa duas vezes; depois de resolvido, um pedido novo avisa de novo', () => {
    socket.receive('friend:updated', request())
    socket.receive('friend:updated', { ...request(), online: true })
    expect(shown).toHaveLength(1)
    socket.receive('friend:updated', request('friend'))
    socket.receive('friend:updated', request())
    expect(shown).toHaveLength(2)
  })

  it('selo acompanha a store e só manda quando o número muda; sair zera', () => {
    expect(badges).toEqual([[0, null]])
    useApp.setState({ unread: { 'dm-ana': true } })
    useApp.setState({ unread: { 'dm-ana': true }, typing: {} })
    expect(badges.map((b) => b[0])).toEqual([0, 1])
    stopNotifications()
    expect(badges.at(-1)).toEqual([0, null])
    useApp.setState({ unread: {} , friends: [request()] })
    expect(badges.map((b) => b[0])).toEqual([0, 1, 0])
  })

  it('clique: abre a conversa ou a tela de amigos', () => {
    clickListener!({ kind: 'dm', channelId: 'dm-ana' })
    expect(st()).toMatchObject({ section: 'home', homeView: { kind: 'dm', channelId: 'dm-ana' } })
    clickListener!({ kind: 'friends' })
    expect(st()).toMatchObject({ section: 'home', homeView: { kind: 'friends' } })
  })

  it('clique numa conversa que não está mais na lista não faz nada', () => {
    useApp.setState({ section: 'community' })
    openNotificationTarget({ kind: 'dm', channelId: 'sumiu' })
    openNotificationTarget(null)
    expect(st().section).toBe('community')
  })
})

describe('clique numa menção de canal (B19)', () => {
  it('abre o canal de texto; sala de voz abre a sala com o chat; canal que sumiu não faz nada', () => {
    useApp.setState({
      ...initialState,
      self: me,
      section: 'home',
      channels: [
        { id: 'geral', name: 'geral', type: 'text', createdAt: 0 },
        { id: 'sala', name: 'Sala', type: 'voice', createdAt: 0 }
      ]
    })
    openNotificationTarget({ kind: 'channel', channelId: 'sumiu' })
    expect(useApp.getState().section).toBe('home')
    openNotificationTarget({ kind: 'channel', channelId: 'sala' })
    expect(useApp.getState()).toMatchObject({ section: 'community', view: { kind: 'voice', channelId: 'sala' }, voiceChatOpen: true })
    expect(useApp.getState().myVoiceChannelId).toBeNull() // não entra na voz
    openNotificationTarget({ kind: 'channel', channelId: 'geral' })
    expect(useApp.getState()).toMatchObject({ section: 'community', view: { kind: 'text', channelId: 'geral' } })
  })
})
