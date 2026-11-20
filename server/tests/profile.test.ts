import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { expectNoEvent, sleep, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const open: ClientSocket[] = []
afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

async function user(server: TestServer, name: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u.socket)
  return u
}

const inMs = (ms: number): string => new Date(Date.now() + ms).toISOString()

describe('bio e status personalizado', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await TestServer.start()
  })

  afterAll(async () => {
    await server?.destroy()
  })

  it('conta nova começa sem bio e sem status', async () => {
    const a = await user(server, 'Nova')
    expect(a.account).toMatchObject({ bio: '', customStatus: null })
    expect(a.self).toMatchObject({ bio: '', customStatus: null })
  })

  it('salva bio e status, avisa as outras pessoas e quem chega depois vê', async () => {
    const a = await user(server, 'Ana')
    const b = await user(server, 'Bia')
    const expiresAt = inMs(60 * 60 * 1000)
    const seen = waitFor(b.socket, 'user:updated', (p) => p.accountId === a.account.id)

    const res = await a.socket.emitWithAck('account:update', {
      bio: '**oi**\nsou a Ana',
      customStatus: { emoji: '🎮', text: 'jogando', expiresAt }
    })

    expect(res).toMatchObject({
      ok: true,
      account: { name: 'Ana', bio: '**oi**\nsou a Ana', customStatus: { emoji: '🎮', text: 'jogando', expiresAt } }
    })
    const [payload] = await seen
    expect(payload).toEqual({
      accountId: a.account.id,
      name: 'Ana',
      tag: a.tag,
      avatarUrl: null,
      bio: '**oi**\nsou a Ana',
      customStatus: { emoji: '🎮', text: 'jogando', expiresAt }
    })

    const c = await user(server, 'Cris')
    expect(c.state.users.find((u) => u.accountId === a.account.id)).toMatchObject({
      bio: '**oi**\nsou a Ana',
      customStatus: { emoji: '🎮', text: 'jogando', expiresAt }
    })
  })

  it('mandar só o status mantém nome e bio; null limpa o status', async () => {
    const a = await user(server, 'Duda')
    await a.socket.emitWithAck('account:update', { bio: 'minha bio' })

    const set = await a.socket.emitWithAck('account:update', { customStatus: { text: 'almoçando' } })
    expect(set).toMatchObject({ ok: true, account: { name: 'Duda', bio: 'minha bio', customStatus: { text: 'almoçando', expiresAt: null } } })

    const cleared = await a.socket.emitWithAck('account:update', { customStatus: null })
    expect(cleared).toMatchObject({ ok: true, account: { name: 'Duda', bio: 'minha bio', customStatus: null } })
  })

  it.each([
    [{ bio: 'x'.repeat(191) }, 'A bio pode ter até 190 caracteres'],
    [{ bio: 'a\nb\nc\nd\ne\nf\ng' }, 'A bio pode ter até 5 quebras de linha'],
    [{ customStatus: { emoji: 'oi' } }, 'Emoji inválido'],
    [{ customStatus: { text: '   ' } }, 'Escolha um emoji ou escreva um status'],
    [{ customStatus: { text: 'x'.repeat(61) } }, 'O status pode ter até 60 caracteres'],
    [{ customStatus: { text: 'a', expiresAt: inMs(-1000) } }, 'Validade inválida']
  ])('recusa %o sem avisar ninguém nem gravar', async (update, error) => {
    const a = await user(server, 'Erra')
    const b = await user(server, 'Olha')
    const silent = expectNoEvent(b.socket, 'user:updated', (p) => p.accountId === a.account.id)

    expect(await a.socket.emitWithAck('account:update', update)).toEqual({ ok: false, error })

    await silent
    const again = await server.connect(a.token)
    open.push(again)
    expect((await again.emitWithAck('hello')).account).toMatchObject({ bio: '', customStatus: null })
  })

  it('status vencido some no hello, na lista de quem está online e na lista de amigos', async () => {
    const a = await user(server, 'Rápida')
    const b = await user(server, 'Amiga')
    await b.socket.emitWithAck('friend:request', `${a.name}#${a.tag}`)
    await a.socket.emitWithAck('friend:request', `${b.name}#${b.tag}`)
    const set = await a.socket.emitWithAck('account:update', { customStatus: { emoji: '☕', expiresAt: inMs(800) } })
    expect(set.ok).toBe(true)

    await sleep(1000)

    const c = await user(server, 'Depois')
    expect(c.state.users.find((u) => u.accountId === a.account.id)?.customStatus).toBeNull()
    const again = await server.connect(a.token)
    open.push(again)
    expect((await again.emitWithAck('hello')).account.customStatus).toBeNull()
    const friends = await b.socket.emitWithAck('friend:list')
    expect(friends.find((f) => f.account.id === a.account.id)?.account.customStatus).toBeNull()
  })
})

describe('limite de alterações de perfil', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await TestServer.start({ env: { RATE_LIMIT_MULTIPLIER: '1' } })
  })

  afterAll(async () => {
    await server?.destroy()
  })

  it('status e bio contam no limite do perfil: 10 seguidas passam, a 11ª é recusada', async () => {
    const a = await user(server, 'Muda')
    for (let i = 1; i <= 10; i++) {
      expect((await a.socket.emitWithAck('account:update', { customStatus: { text: `status ${i}` } })).ok).toBe(true)
    }
    const res = await a.socket.emitWithAck('account:update', { bio: 'mais uma' })
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toMatch(/^Muitas alterações seguidas/)
  })
})
