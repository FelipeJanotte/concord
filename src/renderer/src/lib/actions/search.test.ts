import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Channel, DmEntry, HistoryPage, Message, SearchResult, User } from '@shared/types'
import { bindMessageEvents, jumpToPresent, loadHistory, loadNewerMessages } from '@/lib/actions/messages'
import { closeSearch, jumpToMessage, loadMoreResults, searchMessages } from '@/lib/actions/search'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const sala: Channel = { id: 'sala', name: 'Jogos', type: 'voice', createdAt: 0 }
const dm: DmEntry = { channel: { id: 'dm1', name: '', type: 'dm', createdAt: 0 }, other: { id: 'acc-bia', name: 'Bia', tag: 'bia', color: '#fff', avatarUrl: null } }
const msg = (id: string, channelId = 'geral', over: Partial<Message> = {}): Message => ({ id, channelId, author: ana, content: id, attachments: [], createdAt: 1, ...over })

let socket: FakeSocket
const st = () => useApp.getState()
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindMessageEvents(socket.asSocket())
  useApp.setState({ ...initialState, self: me, users: [me, ana], channels: [geral, sala], dms: [dm] })
})
afterEach(() => setSocket(null))

describe('buscar', () => {
  it('manda a busca com o filtro de: e "neste canal" e guarda os resultados', async () => {
    const found: SearchResult = { ok: true, messages: [msg('r1')], hasMore: true }
    socket.replyTo('message:search', () => found)
    await searchMessages('de:ana  bom dia', 'geral')
    expect(socket.sent('message:search')[0][0]).toEqual({ query: 'bom dia', authorId: 'acc-ana', channelId: 'geral' })
    expect(st().search).toMatchObject({ text: 'de:ana  bom dia', query: 'bom dia', results: [msg('r1')], hasMore: true, loading: false, error: null })
  })

  it('de: com quem não conheço não busca e explica; sem texto também não', async () => {
    await searchMessages('de:Caio oi', null)
    expect(socket.sent('message:search')).toEqual([])
    expect(st().search?.error).toBe('Ninguém chamado "Caio"')
    await searchMessages('   ', null)
    expect(st().search?.error).toBe('Digite o que buscar')
  })

  it('a conversa privada conta como pessoa conhecida no de:', async () => {
    socket.replyTo('message:search', () => ({ ok: true, messages: [], hasMore: false }))
    await searchMessages('de:Bia', null)
    expect(socket.sent('message:search')[0][0]).toEqual({ query: '', authorId: 'acc-bia' })
  })

  it('erro do servidor aparece no painel', async () => {
    socket.replyTo('message:search', () => ({ ok: false, error: 'Muitas buscas seguidas. Tente de novo em 2 s.' }))
    await searchMessages('oi', null)
    expect(st().search).toMatchObject({ loading: false, error: 'Muitas buscas seguidas. Tente de novo em 2 s.', results: [] })
  })

  it('carregar mais pede antes do último resultado e junta no fim', async () => {
    socket.replyTo('message:search', (req) => ({
      ok: true,
      messages: (req as { before?: string }).before ? [msg('r3')] : [msg('r1'), msg('r2')],
      hasMore: !(req as { before?: string }).before
    }))
    await searchMessages('oi', null)
    await loadMoreResults()
    expect(socket.sent('message:search')[1][0]).toEqual({ query: 'oi', before: 'r2' })
    expect(st().search?.results.map((m) => m.id)).toEqual(['r1', 'r2', 'r3'])
    expect(st().search?.hasMore).toBe(false)
    closeSearch()
    expect(st().search).toBeNull()
  })
})

describe('ir até a mensagem', () => {
  it('já carregada: abre o canal e marca o alvo, sem pedir histórico', async () => {
    useApp.setState({ section: 'home', messages: { geral: [msg('m1'), msg('m2')] } })
    await jumpToMessage('geral', 'm1')
    expect(st()).toMatchObject({ section: 'community', view: { kind: 'text', channelId: 'geral' }, jumpTarget: { channelId: 'geral', messageId: 'm1' } })
    expect(socket.sent('message:history')).toEqual([])
  })

  it('fora do histórico carregado: pede a página em volta dela e troca a lista', async () => {
    useApp.setState({ messages: { geral: [msg('m90'), msg('m91')] }, hasMoreHistory: { geral: true } })
    const page: HistoryPage = { messages: [msg('m10'), msg('m11'), msg('m12')], hasMore: true, hasNewer: true }
    socket.replyTo('message:history', () => page)
    await jumpToMessage('geral', 'm11')
    expect(socket.sent('message:history')[0][0]).toEqual({ channelId: 'geral', around: 'm11' })
    expect(st().messages.geral.map((m) => m.id)).toEqual(['m10', 'm11', 'm12'])
    expect(st().hasMoreHistory.geral).toBe(true)
    expect(st().hasNewerHistory.geral).toBe(true)
    expect(st().jumpTarget).toEqual({ channelId: 'geral', messageId: 'm11' })
  })

  it('mensagem que não existe mais: avisa e não marca alvo', async () => {
    socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
    await jumpToMessage('geral', 'sumiu')
    expect(st().jumpTarget).toBeNull()
    expect(st().notice?.text).toBe('Mensagem não encontrada')
  })

  it('conversa privada abre na Home; sala de voz abre o chat da sala', async () => {
    useApp.setState({ messages: { dm1: [msg('d1', 'dm1')], sala: [msg('s1', 'sala')] } })
    await jumpToMessage('dm1', 'd1')
    expect(st()).toMatchObject({ section: 'home', homeView: { kind: 'dm', channelId: 'dm1' } })
    await jumpToMessage('sala', 's1')
    expect(st()).toMatchObject({ section: 'community', view: { kind: 'voice', channelId: 'sala' }, voiceChatOpen: true })
  })

  it('a página mais recente que chega depois do salto não bagunça a lista', async () => {
    let answerLatest: (page: HistoryPage) => void = () => {}
    socket.replyTo('message:history', (req) =>
      (req as { around?: string }).around
        ? { messages: [msg('m10'), msg('m11')], hasMore: true, hasNewer: true }
        : new Promise<HistoryPage>((r) => (answerLatest = r))
    )
    const latest = loadHistory('geral')
    await jumpToMessage('geral', 'm11')
    answerLatest({ messages: [msg('m90')], hasMore: true })
    await latest
    expect(st().messages.geral.map((m) => m.id)).toEqual(['m10', 'm11'])
  })
})

describe('histórico depois do salto', () => {
  beforeEach(() => {
    useApp.setState({ messages: { geral: [msg('m10'), msg('m11')] }, hasNewerHistory: { geral: true } })
  })

  it('mensagem nova não entra no fim enquanto faltam as do meio', () => {
    socket.receive('message:new', msg('m99'))
    expect(st().messages.geral.map((m) => m.id)).toEqual(['m10', 'm11'])
  })

  it('carregar as mais novas pede depois da última e junta no fim', async () => {
    socket.replyTo('message:history', () => ({ messages: [msg('m12'), msg('m13')], hasMore: true, hasNewer: false }))
    await loadNewerMessages('geral')
    expect(socket.sent('message:history')[0][0]).toEqual({ channelId: 'geral', after: 'm11' })
    expect(st().messages.geral.map((m) => m.id)).toEqual(['m10', 'm11', 'm12', 'm13'])
    expect(st().hasNewerHistory.geral).toBe(false)
    socket.receive('message:new', msg('m14'))
    expect(st().messages.geral.at(-1)?.id).toBe('m14')
  })

  it('voltar para as recentes busca a página mais nova de novo', async () => {
    socket.replyTo('message:history', () => ({ messages: [msg('m98'), msg('m99')], hasMore: true }))
    await jumpToPresent('geral')
    await flush()
    expect(socket.sent('message:history')[0][0]).toEqual({ channelId: 'geral' })
    expect(st().messages.geral.map((m) => m.id)).toEqual(['m98', 'm99'])
    expect(st().hasNewerHistory.geral).toBeFalsy()
  })
})
