import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  EVERYONE_ROLE_ID,
  type AuditAction,
  type AuditEntry,
  type AuditFilter,
  type Message,
  type Permission
} from '../../src/shared/types'
import { FakeLiveKit, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, withEnv } from './fake-livekit'
import { TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const livekit = new FakeLiveKit()
let server: TestServer
const open: ClientSocket[] = []

beforeAll(async () => {
  const apiUrl = await livekit.start()
  server = await withEnv({ LIVEKIT_URL, LIVEKIT_API_URL: apiUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET }, () => TestServer.start())
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

async function list(filter: AuditFilter = {}, by?: TestUser): Promise<{ entries: AuditEntry[]; hasMore: boolean }> {
  const who = by ?? (await server.asOwner())
  const res = await who.socket.emitWithAck('audit:list', filter)
  if (!res.ok) throw new Error(res.error)
  return res
}

async function latest(action: AuditAction, actorId?: string): Promise<AuditEntry | undefined> {
  const owner = await server.asOwner()
  return (await list({ action, actorId: actorId ?? owner.self.accountId })).entries[0]
}

const suffix = (): string => Math.random().toString(36).slice(2, 7)
const person = (u: TestUser) => ({ accountId: u.self.accountId, name: u.name, tag: u.tag })

async function join(u: TestUser, channelId: string): Promise<void> {
  const res = await u.socket.emitWithAck('voice:join', { channelId, muted: false, deafened: false })
  if (!res.ok) throw new Error(res.error)
}

async function send(u: TestUser, channelId: string, content: string): Promise<Message> {
  const got = waitFor(u.socket, 'message:new', (m) => m.content === content)
  u.socket.emit('message:send', { channelId, content })
  return (await got)[0]
}

describe('canais', () => {
  it('criar e apagar canal gravam quem, o canal e o nome', async () => {
    const owner = await server.asOwner()
    const name = `audit-${suffix()}`
    const channel = await server.createChannel(name)
    expect(await latest('channel-create')).toMatchObject({
      action: 'channel-create',
      actor: person(owner),
      target: null,
      targetId: channel.id,
      details: { name, type: 'text' }
    })
    const deleted = waitFor(owner.socket, 'channel:deleted', (id) => id === channel.id)
    owner.socket.emit('channel:delete', channel.id)
    await deleted
    expect(await latest('channel-delete')).toMatchObject({ targetId: channel.id, details: { name, type: 'text' } })
  })

  it('criar, renomear e apagar categoria e reordenar os canais', async () => {
    const owner = await server.asOwner()
    const name = `cat-${suffix()}`
    const created = await owner.socket.emitWithAck('category:create', { name })
    if (!created.ok) throw new Error(created.error)
    const categoryId = created.category.id
    expect(await latest('category-create')).toMatchObject({ actor: person(owner), target: null, targetId: categoryId, details: { name } })

    const renamed = `${name}-2`
    await owner.socket.emitWithAck('category:rename', { categoryId, name: renamed })
    expect(await latest('category-rename')).toMatchObject({ targetId: categoryId, details: { name: renamed, previousName: name } })

    const { state } = await owner.socket.emitWithAck('hello')
    const layout = {
      categories: [...(state.categories ?? [])].sort((a, b) => a.position - b.position).map((c) => c.id),
      channels: [...state.channels]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((c) => ({ id: c.id, categoryId: c.categoryId ?? null }))
        .reverse()
    }
    expect(await owner.socket.emitWithAck('channel:layout', layout)).toEqual({ ok: true })
    expect(await latest('channel-layout')).toMatchObject({ actor: person(owner), targetId: null, details: {} })

    await owner.socket.emitWithAck('category:delete', { categoryId })
    expect(await latest('category-delete')).toMatchObject({ targetId: categoryId, details: { name: renamed } })
  })

  it('categoria recusada não grava', async () => {
    const ana = await user('Ana')
    expect((await ana.socket.emitWithAck('category:create', { name: 'proibida' })).ok).toBe(false)
    expect((await list({ actorId: ana.self.accountId })).entries).toEqual([])
  })

  it('canal recusado não grava', async () => {
    const ana = await user('Ana')
    expect((await ana.socket.emitWithAck('channel:create', { name: 'proibido', type: 'text' })).ok).toBe(false)
    expect((await list({ actorId: ana.self.accountId })).entries).toEqual([])
  })
})

describe('cargos e regras', () => {
  it('criar, alterar e apagar cargo, mudar cargos de alguém e as regras de um canal', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const created = await owner.socket.emitWithAck('role:create', { name: 'Vigia', color: null, permissions: [] })
    if (!created.ok) throw new Error(created.error)
    const roleId = created.role.id
    expect(await latest('role-create')).toMatchObject({ actor: person(owner), targetId: roleId, details: { name: 'Vigia' } })

    await owner.socket.emitWithAck('role:update', { id: roleId, name: 'Guarda' })
    expect(await latest('role-update')).toMatchObject({ targetId: roleId, details: { name: 'Guarda' } })

    await owner.socket.emitWithAck('member:set-roles', { accountId: ana.self.accountId, roleIds: [roleId] })
    expect(await latest('member-roles')).toMatchObject({ target: person(ana), details: { added: ['Guarda'], removed: [] } })
    await owner.socket.emitWithAck('member:set-roles', { accountId: ana.self.accountId, roleIds: [] })
    expect(await latest('member-roles')).toMatchObject({ target: person(ana), details: { added: [], removed: ['Guarda'] } })

    const channel = await server.createChannel(`regras-${suffix()}`)
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: channel.id,
      overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['send'] }]
    })
    expect(await latest('channel-overrides')).toMatchObject({ targetId: channel.id, details: { name: channel.name, type: 'text' } })

    expect(await owner.socket.emitWithAck('role:delete', roleId)).toEqual({ ok: true })
    expect(await latest('role-delete')).toMatchObject({ targetId: roleId, details: { name: 'Guarda' } })
  })

  it('mudança recusada não grava', async () => {
    const ana = await user('Ana')
    expect((await ana.socket.emitWithAck('role:create', { name: 'X', color: null, permissions: [] })).ok).toBe(false)
    expect((await ana.socket.emitWithAck('role:delete', EVERYONE_ROLE_ID)).ok).toBe(false)
    expect((await list({ actorId: ana.self.accountId })).entries).toEqual([])
  })
})

describe('moderação da comunidade', () => {
  it('expulsar, banir com motivo, tirar banimento, castigo e tirar castigo', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const bia = await user('Bia')
    const caio = await user('Caio')

    await owner.socket.emitWithAck('moderation:kick', { accountId: ana.self.accountId })
    expect(await latest('kick')).toMatchObject({ actor: person(owner), target: person(ana), targetId: ana.self.accountId })

    await owner.socket.emitWithAck('moderation:ban', { accountId: bia.self.accountId, reason: 'spam' })
    expect(await latest('ban')).toMatchObject({ target: person(bia), details: { reason: 'spam' } })
    await owner.socket.emitWithAck('moderation:unban', { accountId: bia.self.accountId })
    expect(await latest('unban')).toMatchObject({ target: person(bia) })

    await owner.socket.emitWithAck('moderation:timeout', { accountId: caio.self.accountId, minutes: 10 })
    expect(await latest('timeout')).toMatchObject({ target: person(caio), details: { minutes: 10 } })
    await owner.socket.emitWithAck('moderation:timeout', { accountId: caio.self.accountId, minutes: 0 })
    expect(await latest('timeout-clear')).toMatchObject({ target: person(caio) })
  })

  it('ação recusada não grava', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    expect((await ana.socket.emitWithAck('moderation:ban', { accountId: owner.self.accountId })).ok).toBe(false)
    expect((await ana.socket.emitWithAck('moderation:unban', { accountId: owner.self.accountId })).ok).toBe(false)
    expect((await ana.socket.emitWithAck('moderation:timeout', { accountId: owner.self.accountId, minutes: 5 })).ok).toBe(false)
    expect((await list({ actorId: ana.self.accountId })).entries).toEqual([])
  })
})

describe('moderação na voz', () => {
  it('expulsar da sala, mover, silenciar e tirar o silêncio', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const a = await server.createChannel(`Sala ${suffix()}`, 'voice')
    const b = await server.createChannel(`Sala ${suffix()}`, 'voice')
    await join(ana, a.id)

    await owner.socket.emitWithAck('moderation:voice-move', { userId: ana.self.id, channelId: b.id })
    expect(await latest('voice-move')).toMatchObject({ target: person(ana), details: { channelName: b.name } })

    await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: true })
    expect(await latest('voice-mute')).toMatchObject({ target: person(ana) })
    await owner.socket.emitWithAck('moderation:voice-mute', { accountId: ana.self.accountId, muted: false })
    expect(await latest('voice-unmute')).toMatchObject({ target: person(ana) })

    expect(await owner.socket.emitWithAck('moderation:voice-kick', { userId: ana.self.id })).toEqual({ ok: true })
    expect(await latest('voice-kick')).toMatchObject({ target: person(ana), details: { channelName: a.name } })
  })
})

describe('apagar mensagem', () => {
  it('grava quando o moderador apaga a de outra pessoa, não quando o autor apaga a própria', async () => {
    const ana = await user('Ana')
    const mod = await user('Mod')
    await giveRole(mod, ['manageMessages'])
    const channel = await server.createChannel(`geral-${suffix()}`)
    const own = await send(ana, channel.id, 'minha')
    expect(await ana.socket.emitWithAck('message:delete', { messageId: own.id })).toEqual({ ok: true })
    expect((await list({ actorId: ana.self.accountId })).entries).toEqual([])

    const other = await send(ana, channel.id, 'da ana')
    expect(await mod.socket.emitWithAck('message:delete', { messageId: other.id })).toEqual({ ok: true })
    expect(await latest('message-delete', mod.self.accountId)).toMatchObject({
      actor: person(mod),
      target: person(ana),
      targetId: ana.self.accountId,
      details: { messageId: other.id, channel: { name: channel.name, type: 'text' } }
    })
  })
})

describe('quem vê e filtros', () => {
  it('só a dona e quem tem Administrador listam', async () => {
    const roles = await user('Roles')
    await giveRole(roles, ['manageRoles', 'banMembers'])
    expect(await roles.socket.emitWithAck('audit:list', {})).toEqual({ ok: false, error: 'Você não pode ver o registro de auditoria' })
    const admin = await user('Admin')
    await giveRole(admin, ['administrator'])
    expect((await admin.socket.emitWithAck('audit:list', {})).ok).toBe(true)
  })

  it('filtra por ação e recusa filtro inválido', async () => {
    await server.createChannel(`filtro-${suffix()}`)
    const { entries } = await list({ action: 'channel-create' })
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.action === 'channel-create')).toBe(true)
    const owner = await server.asOwner()
    expect(await owner.socket.emitWithAck('audit:list', { action: 'nada' as never })).toEqual({ ok: false, error: 'Filtro inválido' })
    expect(await owner.socket.emitWithAck('audit:list', { actorId: 7 as never })).toEqual({ ok: false, error: 'Filtro inválido' })
  })

  it('páginas de 50, mais novas primeiro, sem repetir', async () => {
    const admin = await user('Admin')
    await giveRole(admin, ['administrator'])
    const owner = await server.asOwner()
    const created = await owner.socket.emitWithAck('role:create', { name: `pag-${suffix()}`, color: null, permissions: [] })
    if (!created.ok) throw new Error(created.error)
    for (let i = 1; i <= 52; i++) {
      const res = await admin.socket.emitWithAck('role:update', { id: created.role.id, name: `nome-${i}` })
      if (!res.ok) throw new Error(res.error)
    }
    const first = await list({ actorId: admin.self.accountId }, admin)
    expect(first.entries).toHaveLength(50)
    expect(first.hasMore).toBe(true)
    expect(first.entries[0].details).toEqual({ name: 'nome-52' })
    const second = await list({ actorId: admin.self.accountId, before: first.entries[49].id }, admin)
    expect(second.hasMore).toBe(false)
    expect(second.entries.map((e) => e.details)).toEqual([{ name: 'nome-2' }, { name: 'nome-1' }])
  })
})
