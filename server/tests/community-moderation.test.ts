import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BANNED_MESSAGE, type Channel, type Permission, type VoiceState } from '../../src/shared/types'
import { FakeLiveKit, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, withEnv } from './fake-livekit'
import { expectNoEvent, TestServer, uniqueCredentials, waitFor, type ClientSocket, type TestUser } from './helpers'

const livekit = new FakeLiveKit()
let server: TestServer
let liveKitApiUrl = ''
const open: ClientSocket[] = []

beforeAll(async () => {
  liveKitApiUrl = await livekit.start()
  server = await withEnv({ LIVEKIT_URL, LIVEKIT_API_URL: liveKitApiUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET }, () => TestServer.start())
})

afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

afterAll(async () => {
  await server?.destroy()
  await livekit.stop()
})

async function user(name?: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u.socket)
  return u
}

async function giveRole(u: TestUser, permissions: Permission[]): Promise<string> {
  const owner = await server.asOwner()
  const res = await owner.socket.emitWithAck('role:create', { name: `cargo-${u.tag}`, color: null, permissions })
  if (!res.ok) throw new Error(res.error)
  const set = await owner.socket.emitWithAck('member:set-roles', { accountId: u.self.accountId, roleIds: [res.role.id] })
  if (!set.ok) throw new Error(set.error)
  return res.role.id
}

async function setRole(u: TestUser, roleId: string): Promise<void> {
  const owner = await server.asOwner()
  const set = await owner.socket.emitWithAck('member:set-roles', { accountId: u.self.accountId, roleIds: [roleId] })
  if (!set.ok) throw new Error(set.error)
}

const disconnected = (s: ClientSocket): Promise<void> =>
  new Promise((resolve) => (s.disconnected ? resolve() : s.once('disconnect', () => resolve())))

const text = (): Promise<Channel> => server.createChannel(`texto-${Math.random().toString(36).slice(2, 7)}`)
const room = (): Promise<Channel> => server.createChannel(`Sala ${Math.random().toString(36).slice(2, 7)}`, 'voice')
const stateOf = (states: VoiceState[], u: TestUser): VoiceState | undefined => states.find((v) => v.userId === u.self.id)
const MINUTE = 60_000

describe('expulsar da comunidade', () => {
  it('a dona expulsa: todas as conexões caem com o aviso, a sessão some e dá para voltar entrando de novo', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const second = await server.connect(ana.token)
    open.push(second)
    const removed = waitFor(ana.socket, 'moderation:removed')
    const removedSecond = waitFor(second, 'moderation:removed')
    expect(await owner.socket.emitWithAck('moderation:kick', { accountId: ana.self.accountId })).toEqual({ ok: true })
    expect((await removed)[0]).toEqual({ kind: 'kick', by: owner.name })
    await removedSecond
    await Promise.all([disconnected(ana.socket), disconnected(second)])
    await expect(server.connect(ana.token)).rejects.toThrow('unauthorized')
    const again = await server.login(ana.email, ana.password)
    expect(again.ok).toBe(true)
  })

  it('kickMembers expulsa quem está abaixo, mas não a dona, cargo igual nem a si mesmo; sem ela ninguém expulsa', async () => {
    const owner = await server.asOwner()
    const mod = await user('Mod')
    const igual = await user('Igual')
    const semCargo = await user('Sem')
    const outro = await user('Outro')
    await setRole(igual, await giveRole(mod, ['kickMembers']))
    const no = { ok: false, error: 'Você não pode expulsar essa pessoa da comunidade' }
    expect(await mod.socket.emitWithAck('moderation:kick', { accountId: owner.self.accountId })).toEqual(no)
    expect(await mod.socket.emitWithAck('moderation:kick', { accountId: igual.self.accountId })).toEqual(no)
    expect(await mod.socket.emitWithAck('moderation:kick', { accountId: mod.self.accountId })).toEqual(no)
    expect(await outro.socket.emitWithAck('moderation:kick', { accountId: semCargo.self.accountId })).toEqual(no)
    expect(await mod.socket.emitWithAck('moderation:kick', { accountId: semCargo.self.accountId })).toEqual({ ok: true })
  })

  it('conta que não existe ou pedido inválido dá erro', async () => {
    const owner = await server.asOwner()
    expect(await owner.socket.emitWithAck('moderation:kick', { accountId: '00000000-0000-0000-0000-000000000123' })).toEqual({
      ok: false,
      error: 'Pessoa não encontrada'
    })
    expect(await owner.socket.emitWithAck('moderation:kick', null as never)).toMatchObject({ ok: false })
  })
})

describe('banir da comunidade', () => {
  it('derruba com o motivo; login e cadastro com o mesmo e-mail são recusados; tirar o ban deixa voltar', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const removed = waitFor(ana.socket, 'moderation:removed')
    expect(await owner.socket.emitWithAck('moderation:ban', { accountId: ana.self.accountId, reason: '  spam  ' })).toEqual({ ok: true })
    expect((await removed)[0]).toEqual({ kind: 'ban', reason: 'spam' })
    await disconnected(ana.socket)
    await expect(server.connect(ana.token)).rejects.toThrow('unauthorized')
    expect(await server.login(ana.email, ana.password)).toEqual({ ok: false, error: BANNED_MESSAGE })
    expect(await server.register({ ...uniqueCredentials('Ana2'), email: ana.email })).toEqual({ ok: false, error: BANNED_MESSAGE })

    const list = await owner.socket.emitWithAck('moderation:bans')
    expect(list.ok && list.bans.find((b) => b.accountId === ana.self.accountId)).toMatchObject({ name: 'Ana', tag: ana.tag, reason: 'spam' })

    expect(await owner.socket.emitWithAck('moderation:unban', { accountId: ana.self.accountId })).toEqual({ ok: true })
    expect((await server.login(ana.email, ana.password)).ok).toBe(true)
    const after = await owner.socket.emitWithAck('moderation:bans')
    expect(after.ok && after.bans.some((b) => b.accountId === ana.self.accountId)).toBe(false)
    expect(await owner.socket.emitWithAck('moderation:unban', { accountId: ana.self.accountId })).toEqual({
      ok: false,
      error: 'Essa pessoa não está banida'
    })
  })

  it('sem motivo grava null; motivo longo demais é recusado', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    expect(await owner.socket.emitWithAck('moderation:ban', { accountId: ana.self.accountId, reason: 'x'.repeat(201) })).toEqual({
      ok: false,
      error: 'O motivo pode ter no máximo 200 caracteres'
    })
    const removed = waitFor(ana.socket, 'moderation:removed')
    expect(await owner.socket.emitWithAck('moderation:ban', { accountId: ana.self.accountId })).toEqual({ ok: true })
    expect((await removed)[0]).toEqual({ kind: 'ban', reason: null })
    await owner.socket.emitWithAck('moderation:unban', { accountId: ana.self.accountId })
  })

  it('banMembers bane, lista e tira; kickMembers não; a hierarquia vale', async () => {
    const owner = await server.asOwner()
    const banidor = await user('Banidor')
    const expulsor = await user('Expulsor')
    const alvo = await user('Alvo')
    await giveRole(banidor, ['banMembers'])
    await giveRole(expulsor, ['kickMembers'])
    const no = { ok: false, error: 'Você não pode banir essa pessoa' }
    expect(await expulsor.socket.emitWithAck('moderation:ban', { accountId: alvo.self.accountId })).toEqual(no)
    expect(await banidor.socket.emitWithAck('moderation:ban', { accountId: owner.self.accountId })).toEqual(no)
    expect(await expulsor.socket.emitWithAck('moderation:bans')).toEqual({ ok: false, error: 'Você não pode ver os banimentos' })
    expect(await banidor.socket.emitWithAck('moderation:ban', { accountId: alvo.self.accountId })).toEqual({ ok: true })
    expect(await expulsor.socket.emitWithAck('moderation:unban', { accountId: alvo.self.accountId })).toEqual({
      ok: false,
      error: 'Você não pode tirar banimentos'
    })
    expect((await banidor.socket.emitWithAck('moderation:bans')).ok).toBe(true)
    expect(await banidor.socket.emitWithAck('moderation:unban', { accountId: alvo.self.accountId })).toEqual({ ok: true })
  })
})

describe('castigo', () => {
  it('avisa todos com o prazo; recusa mensagem e reação até tirar; 0 tira', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const bia = await user('Bia')
    const canal = await text()
    const sent = await owner.socket.emitWithAck('message:send', { channelId: canal.id, content: 'oi' })
    expect(sent.ok).toBe(true)
    const history = await owner.socket.emitWithAck('message:history', { channelId: canal.id })
    const messageId = history.messages[0].id

    const changed = waitFor(bia.socket, 'moderation:timeout-changed', (p) => p.accountId === ana.self.accountId)
    const before = Date.now()
    expect(await owner.socket.emitWithAck('moderation:timeout', { accountId: ana.self.accountId, minutes: 10 })).toEqual({ ok: true })
    const [{ until }] = await changed
    expect(until).toBeGreaterThanOrEqual(before + 10 * MINUTE)
    expect(until).toBeLessThanOrEqual(Date.now() + 10 * MINUTE)

    const refused = await ana.socket.emitWithAck('message:send', { channelId: canal.id, content: 'oi' })
    expect(refused).toMatchObject({ ok: false })
    expect(!refused.ok && refused.error).toMatch(/^Você está de castigo até \d{2}:\d{2}$/)
    expect(await ana.socket.emitWithAck('message:react', { messageId, emoji: '👍', on: true })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^Você está de castigo até/)
    })
    expect(await ana.socket.emitWithAck('moderation:timeouts')).toContainEqual({ accountId: ana.self.accountId, until })

    const cleared = waitFor(ana.socket, 'moderation:timeout-changed', (p) => p.accountId === ana.self.accountId && p.until === null)
    expect(await owner.socket.emitWithAck('moderation:timeout', { accountId: ana.self.accountId, minutes: 0 })).toEqual({ ok: true })
    await cleared
    expect((await ana.socket.emitWithAck('message:send', { channelId: canal.id, content: 'voltei' })).ok).toBe(true)
    expect(await ana.socket.emitWithAck('moderation:timeouts')).not.toContainEqual(expect.objectContaining({ accountId: ana.self.accountId }))
  })

  it('silencia na voz pelo mesmo caminho do silêncio do servidor e devolve a fala ao tirar', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const sala = await room()
    await ana.socket.emitWithAck('voice:join', { channelId: sala.id, muted: false, deafened: false })
    const muted = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.serverMuted === true && stateOf(s, ana)?.muted === true)
    await owner.socket.emitWithAck('moderation:timeout', { accountId: ana.self.accountId, minutes: 1 })
    await muted
    await livekit.waitCall(
      'UpdateParticipant',
      (b) =>
        b.identity === ana.self.id &&
        !((b.permission as { canPublishSources?: unknown[] })?.canPublishSources ?? []).some((s) => s === 2 || s === 'MICROPHONE')
    )
    const rejoin = await ana.socket.emitWithAck('voice:join', { channelId: sala.id, muted: false, deafened: false })
    expect(rejoin).toMatchObject({ ok: true, canSpeak: false })

    const back = waitFor(owner.socket, 'voice:state', (s) => stateOf(s, ana)?.serverMuted === false && stateOf(s, ana)?.muted === false)
    await owner.socket.emitWithAck('moderation:timeout', { accountId: ana.self.accountId, minutes: 0 })
    await back
    ana.socket.emit('voice:leave')
  })

  it('timeoutMembers castiga quem está abaixo; sem ela, sobre a dona ou cargo igual, recusa', async () => {
    const owner = await server.asOwner()
    const mod = await user('Mod')
    const igual = await user('Igual')
    const alvo = await user('Alvo')
    await setRole(igual, await giveRole(mod, ['timeoutMembers']))
    const no = { ok: false, error: 'Você não pode pôr essa pessoa de castigo' }
    expect(await alvo.socket.emitWithAck('moderation:timeout', { accountId: mod.self.accountId, minutes: 1 })).toEqual(no)
    expect(await mod.socket.emitWithAck('moderation:timeout', { accountId: owner.self.accountId, minutes: 1 })).toEqual(no)
    expect(await mod.socket.emitWithAck('moderation:timeout', { accountId: igual.self.accountId, minutes: 1 })).toEqual(no)
    expect(await mod.socket.emitWithAck('moderation:timeout', { accountId: alvo.self.accountId, minutes: 1 })).toEqual({ ok: true })
    await mod.socket.emitWithAck('moderation:timeout', { accountId: alvo.self.accountId, minutes: 0 })
  })

  it.each([-1, 10_081, 1.5, 'x', undefined])('minutos inválidos (%s) são recusados sem avisar ninguém', async (minutes) => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const silent = expectNoEvent(ana.socket, 'moderation:timeout-changed')
    expect(await owner.socket.emitWithAck('moderation:timeout', { accountId: ana.self.accountId, minutes: minutes as number })).toEqual({
      ok: false,
      error: 'Escolha de 1 minuto a 7 dias'
    })
    await silent
  })

  it('aceita o máximo de 7 dias e continua valendo depois de reiniciar o servidor', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const canal = await text()
    expect(await owner.socket.emitWithAck('moderation:timeout', { accountId: ana.self.accountId, minutes: 10_080 })).toEqual({ ok: true })
    await withEnv({ LIVEKIT_URL, LIVEKIT_API_URL: liveKitApiUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET }, () => server.restart())
    const socket = await server.connect(ana.token)
    open.push(socket)
    await socket.emitWithAck('hello')
    const refused = await socket.emitWithAck('message:send', { channelId: canal.id, content: 'oi' })
    expect(!refused.ok && refused.error).toMatch(/^Você está de castigo até \d{2}\/\d{2} \d{2}:\d{2}$/)
    const owner2 = await server.asOwner()
    await owner2.socket.emitWithAck('moderation:timeout', { accountId: ana.self.accountId, minutes: 0 })
  }, 60_000)
})
