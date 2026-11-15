// Mover os times para salas de voz (v4): servidor de verdade + LiveKit falso. Cada pessoa movida
// recebe `tools:moved` com a sala do time; quem não dá para mover vem em `skipped`.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Channel, Message, MoveTeamsResult, Permission, TeamPlayer } from '../../src/shared/types'
import { FakeLiveKit, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, withEnv } from './fake-livekit'
import { expectNoEvent, TestServer, waitFor, type TestUser } from './helpers'

const EVERYONE = '00000000-0000-0000-0000-000000000000'
const livekit = new FakeLiveKit()
let server: TestServer
const open: TestUser[] = []

beforeAll(async () => {
  const apiUrl = await livekit.start()
  server = await withEnv({ LIVEKIT_URL, LIVEKIT_API_URL: apiUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET }, () => TestServer.start())
})

afterEach(async () => {
  // a dona é a mesma em todos os testes: sai da voz para não sobrar em sala
  ;(await server.asOwner()).socket.emit('voice:leave')
  for (const u of open.splice(0)) u.socket.close()
})

afterAll(async () => {
  await server?.destroy()
  await livekit.stop()
})

async function user(name: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u)
  return u
}

const suffix = (): string => Math.random().toString(36).slice(2, 7)
const room = (): Promise<Channel> => server.createChannel(`Sala ${suffix()}`, 'voice')
const text = (): Promise<Channel> => server.createChannel(`geral-${suffix()}`)

async function join(u: TestUser, channelId: string): Promise<void> {
  const res = await u.socket.emitWithAck('voice:join', { channelId, muted: false, deafened: false })
  if (!res.ok) throw new Error(res.error)
}

async function giveRole(u: TestUser, permissions: Permission[]): Promise<void> {
  const owner = await server.asOwner()
  const res = await owner.socket.emitWithAck('role:create', { name: `cargo-${u.tag}`, color: null, permissions })
  if (!res.ok) throw new Error(res.error)
  const set = await owner.socket.emitWithAck('member:set-roles', { accountId: u.self.accountId, roleIds: [res.role.id] })
  if (!set.ok) throw new Error(set.error)
}

/** Sorteia 1 time por pessoa (cada time = 1 pessoa, então a ordem dos times diz quem foi para onde). */
async function draw(by: TestUser, channelId: string, players: TeamPlayer[]): Promise<Message> {
  const res = await by.socket.emitWithAck('tools:teams', { channelId, players, teamCount: players.length })
  if (!res.ok) throw new Error(res.error)
  return res.message
}

/** As salas na ordem dos times do sorteio, escolhidas pelo nome de cada um. */
function roomsFor(message: Message, rooms: Record<string, string | null>): (string | null)[] {
  if (message.tool?.tool !== 'teams') throw new Error('não é sorteio de times')
  return message.tool.result.teams.map((t) => rooms[t.members[0].name] ?? null)
}

const move = (u: TestUser, messageId: string, channelIds: (string | null)[]): Promise<MoveTeamsResult> =>
  u.socket.emitWithAck('tools:move-teams', { messageId, channelIds })

describe('tools:move-teams', () => {
  it('a dona leva cada pessoa para a sala do time (pela conta ou pelo nome); quem não está na voz é pulado', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const bia = await user('Bia')
    const [lobby, t1, t2, ch] = [await room(), await room(), await room(), await text()]
    await join(ana, lobby.id)
    await join(bia, lobby.id)
    await join(owner, lobby.id)

    const msg = await draw(owner, ch.id, [
      { name: 'Apelido da Ana', accountId: ana.self.accountId },
      { name: `bia#${bia.tag}` },
      { name: owner.name, accountId: owner.self.accountId },
      { name: 'Duda' }
    ])
    const anaMoved = waitFor(ana.socket, 'tools:moved')
    const biaMoved = waitFor(bia.socket, 'tools:moved')
    const ownerStays = expectNoEvent(owner.socket, 'tools:moved')
    // os times da dona e da Duda ficam sem sala (null): ninguém deles é movido nem procurado
    const res = await move(owner, msg.id, roomsFor(msg, { 'Apelido da Ana': t1.id, [`bia#${bia.tag}`]: t2.id }))
    expect(res).toEqual({ ok: true, moved: 2, skipped: [] })
    expect((await anaMoved)[0]).toEqual({ channelId: t1.id, by: owner.name })
    expect((await biaMoved)[0]).toEqual({ channelId: t2.id, by: owner.name })
    await ownerStays

    // Duda num time com sala: não está na voz
    const again = await move(owner, msg.id, roomsFor(msg, { Duda: t1.id }))
    expect(again).toEqual({ ok: true, moved: 0, skipped: [{ name: 'Duda', reason: 'not-in-voice' }] })
  })

  it('quem já está na sala do time não conta e não recebe aviso', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const [t1, ch] = [await room(), await text()]
    await join(ana, t1.id)
    const msg = await draw(owner, ch.id, [{ name: 'Ana', accountId: ana.self.accountId }, { name: 'Ninguém' }])
    const silent = expectNoEvent(ana.socket, 'tools:moved')
    expect(await move(owner, msg.id, roomsFor(msg, { Ana: t1.id }))).toEqual({ ok: true, moved: 0, skipped: [] })
    await silent
  })

  it('sem gerenciar membros: move só a si mesmo; os outros são pulados', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const [lobby, t1, t2, ch] = [await room(), await room(), await room(), await text()]
    await join(ana, lobby.id)
    await join(bia, lobby.id)
    const msg = await draw(ana, ch.id, [
      { name: 'Ana', accountId: ana.self.accountId },
      { name: 'Bia', accountId: bia.self.accountId }
    ])
    const anaMoved = waitFor(ana.socket, 'tools:moved')
    const silent = expectNoEvent(bia.socket, 'tools:moved')
    expect(await move(ana, msg.id, roomsFor(msg, { Ana: t1.id, Bia: t2.id }))).toEqual({
      ok: true,
      moved: 1,
      skipped: [{ name: 'Bia', reason: 'not-allowed' }]
    })
    expect((await anaMoved)[0].channelId).toBe(t1.id)
    await silent
  })

  it('moderador move quem está abaixo; a dona é pulada', async () => {
    const owner = await server.asOwner()
    const mod = await user('Mod')
    const ana = await user('Ana')
    await giveRole(mod, ['manageMembers'])
    const [lobby, t1, t2, ch] = [await room(), await room(), await room(), await text()]
    await join(ana, lobby.id)
    await join(owner, lobby.id)
    const msg = await draw(mod, ch.id, [
      { name: 'Ana', accountId: ana.self.accountId },
      { name: 'Dona', accountId: owner.self.accountId }
    ])
    const anaMoved = waitFor(ana.socket, 'tools:moved')
    expect(await move(mod, msg.id, roomsFor(msg, { Ana: t1.id, Dona: t2.id }))).toEqual({
      ok: true,
      moved: 1,
      skipped: [{ name: 'Dona', reason: 'not-allowed' }]
    })
    expect((await anaMoved)[0]).toEqual({ channelId: t1.id, by: mod.name })
  })

  it('quem não pode entrar na sala do time é pulado (no-access)', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const [lobby, fechada, ch] = [await room(), await room(), await text()]
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: fechada.id,
      overrides: [{ roleId: EVERYONE, allow: [], deny: ['connect'] }]
    })
    await join(ana, lobby.id)
    const msg = await draw(owner, ch.id, [{ name: 'Ana', accountId: ana.self.accountId }, { name: 'X' }])
    const silent = expectNoEvent(ana.socket, 'tools:moved')
    expect(await move(owner, msg.id, roomsFor(msg, { Ana: fechada.id }))).toEqual({
      ok: true,
      moved: 0,
      skipped: [{ name: 'Ana', reason: 'no-access' }]
    })
    await silent
  })

  it('nome que bate com duas contas na voz é pulado (ambiguous)', async () => {
    const owner = await server.asOwner()
    const nome = `Gêmea ${suffix()}`
    const g1 = await user(nome)
    const g2 = await user(nome)
    const [lobby, t1, ch] = [await room(), await room(), await text()]
    await join(g1, lobby.id)
    await join(g2, lobby.id)
    const msg = await draw(owner, ch.id, [{ name: nome }, { name: 'Outro' }])
    expect(await move(owner, msg.id, roomsFor(msg, { [nome]: t1.id }))).toEqual({
      ok: true,
      moved: 0,
      skipped: [{ name: nome, reason: 'ambiguous' }]
    })
  })

  it('erros do pedido: sem gastar nada nem mover ninguém', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const [lobby, t1, ch] = [await room(), await room(), await text()]
    await join(ana, lobby.id)
    const msg = await draw(owner, ch.id, [{ name: 'Ana', accountId: ana.self.accountId }, { name: 'X' }])
    const dice = await owner.socket.emitWithAck('tools:dice', { channelId: ch.id, sides: 6, count: 1 })
    if (!dice.ok) throw new Error(dice.error)
    const silent = expectNoEvent(ana.socket, 'tools:moved')

    const notFound = { ok: false, error: 'Sorteio de times não encontrado' }
    expect(await move(owner, dice.message.id, [t1.id])).toEqual(notFound)
    expect(await move(owner, '00000000-0000-0000-0000-000000000001', [t1.id])).toEqual(notFound)
    expect(await move(owner, 'nada', [t1.id])).toEqual(notFound)
    expect(await move(owner, msg.id, [t1.id])).toEqual({ ok: false, error: 'Escolha uma sala para cada time' })
    expect(await move(owner, msg.id, [ch.id, null])).toEqual({ ok: false, error: 'Sala de voz não encontrada' })
    expect(await move(owner, msg.id, [null, null])).toEqual({ ok: false, error: 'Escolha a sala de pelo menos um time' })
    expect(await move(owner, msg.id, [t1.id, t1.id])).toEqual({ ok: false, error: 'Escolha uma sala diferente para cada time' })
    expect(await owner.socket.emitWithAck('tools:move-teams', null as never)).toEqual({ ok: false, error: 'Pedido inválido' })
    await silent
  })

  it('sorteio de um canal que a pessoa não vê: como se não existisse', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const [t1, segredo] = [await room(), await text()]
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: segredo.id,
      overrides: [{ roleId: EVERYONE, allow: [], deny: ['view'] }]
    })
    const msg = await draw(owner, segredo.id, [{ name: 'Ana' }, { name: 'X' }])
    expect(await move(ana, msg.id, roomsFor(msg, { Ana: t1.id }))).toEqual({ ok: false, error: 'Sorteio de times não encontrado' })
  })
})
