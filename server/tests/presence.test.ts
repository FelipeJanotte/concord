import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

let server: TestServer
const open: ClientSocket[] = []

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
  const u = await server.newUser()
  open.push(u.socket)
  return u
}

async function otherWindow(u: TestUser): Promise<ClientSocket> {
  const s = await server.connect(u.token)
  open.push(s)
  await s.emitWithAck('hello')
  return s
}

const statusOf = (watcher: TestUser, who: TestUser, status: string) =>
  waitFor(watcher.socket, 'presence:status', (p) => p.accountId === who.account.id && p.status === status)

describe('status no hello', () => {
  it('quem conecta aparece online e vê o status de quem já estava', async () => {
    const a = await user()
    expect(a.state.statuses[a.account.id]).toBe('online')
    const idle = statusOf(a, a, 'idle')
    a.socket.emit('presence:set-status', 'idle')
    await idle
    const b = await user()
    expect(b.state.statuses[a.account.id]).toBe('idle')
    expect(b.state.statuses[b.account.id]).toBe('online')
  })
})

describe('ausente', () => {
  it('conexão parada avisa todos que a conta está ausente; mexer volta para online', async () => {
    const a = await user()
    const b = await user()
    const idle = statusOf(b, a, 'idle')
    a.socket.emit('presence:set-status', 'idle')
    await idle
    const back = statusOf(b, a, 'online')
    a.socket.emit('presence:set-status', 'online')
    await back
  })

  it('com duas janelas, só fica ausente quando as duas estão paradas', async () => {
    const a = await user()
    const second = await otherWindow(a)
    const b = await user()
    const stillOnline = expectNoEvent(b.socket, 'presence:status', (p) => p.accountId === a.account.id)
    a.socket.emit('presence:set-status', 'idle')
    await stillOnline
    const idle = statusOf(b, a, 'idle')
    second.emit('presence:set-status', 'idle')
    await idle
  })

  it('fechar a única janela ativa deixa a conta ausente', async () => {
    const a = await user()
    const second = await otherWindow(a)
    const b = await user()
    a.socket.emit('presence:set-status', 'idle')
    await expectNoEvent(b.socket, 'presence:status', (p) => p.accountId === a.account.id)
    const idle = statusOf(b, a, 'idle')
    second.close()
    await idle
  })

  it('status repetido ou inválido não anuncia nada', async () => {
    const a = await user()
    const b = await user()
    const nothing = expectNoEvent(b.socket, 'presence:status', (p) => p.accountId === a.account.id)
    a.socket.emit('presence:set-status', 'online')
    a.socket.emit('presence:set-status', 'dnd' as never)
    a.socket.emit('presence:set-status', 42 as never)
    await nothing
  })
})

describe('Não perturbe', () => {
  it('salvo nas preferências: avisa todos, vale por cima do ausente e volta ao reconectar', async () => {
    const a = await user()
    const b = await user()
    const dnd = statusOf(b, a, 'dnd')
    const res = await a.socket.emitWithAck('preferences:update', { doNotDisturb: true })
    expect(res).toMatchObject({ ok: true, preferences: { doNotDisturb: true } })
    await dnd

    const nothing = expectNoEvent(b.socket, 'presence:status', (p) => p.accountId === a.account.id)
    a.socket.emit('presence:set-status', 'idle')
    await nothing

    a.socket.close()
    const again = await server.connect(a.token)
    open.push(again)
    const hello = await again.emitWithAck('hello')
    expect(hello.state.statuses[a.account.id]).toBe('dnd')
    expect((await again.emitWithAck('preferences:get')).doNotDisturb).toBe(true)

    const online = statusOf(b, a, 'online')
    await again.emitWithAck('preferences:update', { doNotDisturb: false })
    await online
  })

  it('valor que não é sim/não é recusado', async () => {
    const a = await user()
    expect(await a.socket.emitWithAck('preferences:update', { doNotDisturb: 'sim' as never })).toEqual({ ok: false, error: 'Não perturbe inválido' })
  })
})
