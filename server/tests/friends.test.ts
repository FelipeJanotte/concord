// Amizades (A6) no servidor real: pedidos por nome#id, aceitar, recusar, desfazer, bloquear e online só para amigos.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

let server: TestServer
const open: ClientSocket[] = []
let n = 0

beforeAll(async () => {
  server = await TestServer.start()
})

afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

afterAll(async () => {
  await server?.destroy()
})

async function user(): Promise<TestUser> {
  const u = await server.newUser(`Pessoa ${++n}`)
  open.push(u.socket)
  return u
}

const target = (u: TestUser): string => `${u.name}#${u.tag}`

async function friends(a: TestUser, b: TestUser): Promise<void> {
  expect((await a.socket.emitWithAck('friend:request', target(b))).ok).toBe(true)
  expect((await b.socket.emitWithAck('friend:accept', a.account.id)).ok).toBe(true)
}

describe('pedido de amizade', () => {
  it('chega para a outra pessoa como pedido recebido; quem pediu vê como enviado', async () => {
    const a = await user()
    const b = await user()
    const incoming = waitFor(b.socket, 'friend:updated', (e) => e.account.id === a.account.id)
    const res = await a.socket.emitWithAck('friend:request', target(b))
    expect(res).toMatchObject({ ok: true, entry: { status: 'outgoing', account: { id: b.account.id, tag: b.tag }, online: false } })
    expect((await incoming)[0]).toMatchObject({ status: 'incoming', online: false })
    expect((await b.socket.emitWithAck('friend:list')).map((e) => [e.account.id, e.status])).toEqual([[a.account.id, 'incoming']])
  })

  it('nome e id precisam bater (id sozinho não basta); erros claros', async () => {
    const a = await user()
    const b = await user()
    expect(await a.socket.emitWithAck('friend:request', `Outro Nome#${b.tag}`)).toEqual({ ok: false, error: 'Ninguém com esse nome#id' })
    expect(await a.socket.emitWithAck('friend:request', 'sem-id')).toEqual({ ok: false, error: 'Digite o nome e o id, assim: Ana#1234' })
    expect(await a.socket.emitWithAck('friend:request', target(a))).toEqual({ ok: false, error: 'Você não pode adicionar a si mesmo' })
    expect((await a.socket.emitWithAck('friend:request', `${b.name.toUpperCase()}#${b.tag.toUpperCase()}`)).ok).toBe(true)
    expect(await a.socket.emitWithAck('friend:request', target(b))).toEqual({ ok: false, error: 'Pedido já enviado' })
  })

  it('pedir de volta para quem já me pediu aceita na hora', async () => {
    const a = await user()
    const b = await user()
    await a.socket.emitWithAck('friend:request', target(b))
    const res = await b.socket.emitWithAck('friend:request', target(a))
    expect(res).toMatchObject({ ok: true, entry: { status: 'friend', online: true } })
    expect(await a.socket.emitWithAck('friend:request', target(b))).toEqual({ ok: false, error: 'Vocês já são amigos' })
  })

  it('aceitar: os dois viram amigos e se veem online', async () => {
    const a = await user()
    const b = await user()
    await a.socket.emitWithAck('friend:request', target(b))
    const forA = waitFor(a.socket, 'friend:updated', (e) => e.account.id === b.account.id && e.status === 'friend')
    expect(await b.socket.emitWithAck('friend:accept', a.account.id)).toMatchObject({ ok: true, entry: { status: 'friend', online: true } })
    expect((await forA)[0].online).toBe(true)
    expect(await b.socket.emitWithAck('friend:accept', a.account.id)).toEqual({ ok: false, error: 'Pedido não encontrado' })
  })

  it('recusar (ou cancelar) apaga para os dois lados', async () => {
    const a = await user()
    const b = await user()
    await a.socket.emitWithAck('friend:request', target(b))
    const removedForA = waitFor(a.socket, 'friend:removed', (id) => id === b.account.id)
    expect(await b.socket.emitWithAck('friend:decline', a.account.id)).toEqual({ ok: true, entry: null })
    await removedForA
    expect(await a.socket.emitWithAck('friend:list')).toEqual([])

    await a.socket.emitWithAck('friend:request', target(b))
    expect(await a.socket.emitWithAck('friend:decline', b.account.id)).toEqual({ ok: true, entry: null }) // cancelar
    expect(await b.socket.emitWithAck('friend:list')).toEqual([])
  })

  it('desfazer amizade', async () => {
    const a = await user()
    const b = await user()
    await friends(a, b)
    expect(await a.socket.emitWithAck('friend:remove', b.account.id)).toEqual({ ok: true, entry: null })
    expect(await a.socket.emitWithAck('friend:remove', b.account.id)).toEqual({ ok: false, error: 'Vocês não são amigos' })
  })
})

describe('bloquear', () => {
  it('quem foi bloqueado perde a relação, não consegue pedir e não sabe do bloqueio', async () => {
    const a = await user()
    const b = await user()
    await friends(a, b)
    const removedForB = waitFor(b.socket, 'friend:removed', (id) => id === a.account.id)
    expect(await a.socket.emitWithAck('friend:block', b.account.id)).toMatchObject({ ok: true, entry: { status: 'blocked' } })
    await removedForB
    expect(await b.socket.emitWithAck('friend:list')).toEqual([])
    expect(await b.socket.emitWithAck('friend:request', target(a))).toEqual({ ok: false, error: 'Não foi possível enviar o pedido' })
    expect(await a.socket.emitWithAck('friend:request', target(b))).toEqual({
      ok: false,
      error: 'Você bloqueou essa pessoa. Desbloqueie antes de pedir amizade.'
    })
  })

  it('desbloquear volta a permitir pedidos', async () => {
    const a = await user()
    const b = await user()
    await a.socket.emitWithAck('friend:block', b.account.id)
    expect(await a.socket.emitWithAck('friend:unblock', b.account.id)).toEqual({ ok: true, entry: null })
    expect(await a.socket.emitWithAck('friend:unblock', b.account.id)).toEqual({ ok: false, error: 'Essa pessoa não está bloqueada' })
    expect((await b.socket.emitWithAck('friend:request', target(a))).ok).toBe(true)
  })

  it('bloquear id inválido ou conta inexistente', async () => {
    const a = await user()
    expect(await a.socket.emitWithAck('friend:block', 'lixo')).toEqual({ ok: false, error: 'Conta inválida' })
    expect(await a.socket.emitWithAck('friend:block', '11111111-1111-1111-1111-111111111111')).toEqual({
      ok: false,
      error: 'Conta não encontrada'
    })
  })
})

describe('online só para amigos', () => {
  it('amigo recebe online/offline (na primeira janela e quando a última fecha); quem não é amigo não', async () => {
    const a = await user()
    const b = await user()
    const stranger = await user()
    await friends(a, b)
    b.socket.close()

    // b volta: a recebe online; o estranho não recebe nada
    const online = waitFor(a.socket, 'friend:presence', (p) => p.accountId === b.account.id && p.online)
    const nothing = expectNoEvent(stranger.socket, 'friend:presence')
    const b1 = await server.connect(b.token)
    open.push(b1)
    await b1.emitWithAck('hello')
    await online
    await nothing

    // segunda janela de b não repete o aviso
    const noRepeat = expectNoEvent(a.socket, 'friend:presence', (p) => p.accountId === b.account.id)
    const b2 = await server.connect(b.token)
    open.push(b2)
    await b2.emitWithAck('hello')
    await noRepeat

    // fecha uma janela: continua online; fecha a última: offline
    const stillOnline = expectNoEvent(a.socket, 'friend:presence', (p) => p.accountId === b.account.id)
    b1.close()
    await stillOnline
    const offline = waitFor(a.socket, 'friend:presence', (p) => p.accountId === b.account.id && !p.online)
    b2.close()
    await offline
  })

  it('o online na lista aparece só para amigos (pedido pendente mostra offline)', async () => {
    const a = await user()
    const b = await user()
    await a.socket.emitWithAck('friend:request', target(b))
    expect((await a.socket.emitWithAck('friend:list'))[0]).toMatchObject({ status: 'outgoing', online: false })
  })
})
