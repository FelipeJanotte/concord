import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, type Channel, type ChannelCategory, type ChannelLayout } from '../../src/shared/types'
import { TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

let server: TestServer
let owner: TestUser
const open: ClientSocket[] = []

beforeAll(async () => {
  server = await TestServer.start()
  owner = await server.asOwner()
})

afterEach(async () => {
  for (const s of open.splice(0)) s.close()
  const { state } = await owner.socket.emitWithAck('hello')
  for (const c of state.categories ?? []) await owner.socket.emitWithAck('category:delete', { categoryId: c.id })
})

afterAll(async () => {
  await server?.destroy()
})

async function user(name?: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u.socket)
  return u
}

async function createCategory(name: string): Promise<ChannelCategory> {
  const res = await owner.socket.emitWithAck('category:create', { name })
  if (!res.ok) throw new Error(res.error)
  return res.category
}

async function removeChannel(channelId: string): Promise<void> {
  const deleted = waitFor(owner.socket, 'channel:deleted', (id) => id === channelId)
  owner.socket.emit('channel:delete', channelId)
  await deleted
}

const byPosition = (channels: Channel[]): Channel[] => [...channels].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

async function currentLayout(who: TestUser): Promise<ChannelLayout> {
  const { state } = await who.socket.emitWithAck('hello')
  return {
    categories: (state.categories ?? []).sort((a, b) => a.position - b.position).map((c) => c.id),
    channels: byPosition(state.channels).map((c) => ({ id: c.id, categoryId: c.categoryId ?? null }))
  }
}

describe('hello', () => {
  it('traz os canais padrão com posições estáveis e a lista de categorias', async () => {
    const u = await user()
    const names = byPosition(u.state.channels).map((c) => c.name)
    expect(names.slice(0, 4)).toEqual(['geral', 'off-topic', 'Sala de Voz', 'Jogos'])
    expect(new Set(u.state.channels.map((c) => c.position)).size).toBe(u.state.channels.length)
    expect(u.state.channels.every((c) => c.categoryId === null)).toBe(true)

    const category = await createCategory('Jogos')
    const { state } = await u.socket.emitWithAck('hello')
    expect(state.categories).toEqual([category])
  })

  it('canal novo entra no fim, na categoria escolhida', async () => {
    const category = await createCategory('Fim')
    const before = await currentLayout(owner)
    const res = await owner.socket.emitWithAck('channel:create', { name: 'no-fim', type: 'text', categoryId: category.id })
    if (!res.ok) throw new Error(res.error)
    expect(res.channel.categoryId).toBe(category.id)
    const after = await currentLayout(owner)
    expect(after.channels.at(-1)).toEqual({ id: res.channel.id, categoryId: category.id })
    expect(after.channels).toHaveLength(before.channels.length + 1)
    await removeChannel(res.channel.id)
  })

  it('criar canal numa categoria que não existe é recusado', async () => {
    const res = await owner.socket.emitWithAck('channel:create', { name: 'perdido', type: 'text', categoryId: crypto.randomUUID() })
    expect(res).toEqual({ ok: false, error: 'Essa categoria não existe' })
  })
})

describe('categorias', () => {
  it('criar, renomear e apagar avisam todos com channels:layout', async () => {
    const u = await user()
    const created = waitFor(u.socket, 'channels:layout', (l) => l.categories.some((c) => c.name === 'Texto'))
    const category = await createCategory('  Texto  ')
    expect(category.name).toBe('Texto')
    await created

    const renamed = waitFor(u.socket, 'channels:layout', (l) => l.categories.some((c) => c.name === 'Bate-papo'))
    const res = await owner.socket.emitWithAck('category:rename', { categoryId: category.id, name: 'Bate-papo' })
    expect(res).toEqual({ ok: true, category: { ...category, name: 'Bate-papo' } })
    await renamed

    const deleted = waitFor(u.socket, 'channels:layout', (l) => l.categories.length === 0)
    expect(await owner.socket.emitWithAck('category:delete', { categoryId: category.id })).toEqual({ ok: true })
    await deleted
  })

  it('apagar a categoria deixa os canais dela sem categoria', async () => {
    const category = await createCategory('Some')
    const res = await owner.socket.emitWithAck('channel:create', { name: 'orfao', type: 'text', categoryId: category.id })
    if (!res.ok) throw new Error(res.error)
    await owner.socket.emitWithAck('category:delete', { categoryId: category.id })
    const layout = await currentLayout(owner)
    expect(layout.channels.find((c) => c.id === res.channel.id)).toEqual({ id: res.channel.id, categoryId: null })
    await removeChannel(res.channel.id)
  })

  it('nome vazio e categoria inexistente são recusados', async () => {
    expect(await owner.socket.emitWithAck('category:create', { name: '   ' })).toEqual({ ok: false, error: 'Dê um nome à categoria' })
    expect(await owner.socket.emitWithAck('category:rename', { categoryId: crypto.randomUUID(), name: 'x' })).toEqual({
      ok: false,
      error: 'Essa categoria não existe'
    })
  })

  it('sem gerenciar canais, tudo é recusado', async () => {
    const u = await user()
    const category = await createCategory('Fechada')
    const denied = { ok: false, error: 'Você não tem permissão para gerenciar canais' }
    expect(await u.socket.emitWithAck('category:create', { name: 'x' })).toEqual(denied)
    expect(await u.socket.emitWithAck('category:rename', { categoryId: category.id, name: 'x' })).toEqual(denied)
    expect(await u.socket.emitWithAck('category:delete', { categoryId: category.id })).toEqual(denied)
    expect(await u.socket.emitWithAck('channel:layout', await currentLayout(u))).toEqual(denied)
  })
})

describe('channel:layout', () => {
  it('grava a ordem nova e avisa com as posições', async () => {
    const u = await user()
    const a = await createCategory('A')
    const b = await createCategory('B')
    const layout = await currentLayout(owner)
    const [first, ...rest] = layout.channels
    const next: ChannelLayout = {
      categories: [b.id, a.id],
      channels: [...rest.map((c) => ({ ...c, categoryId: null })), { id: first!.id, categoryId: a.id }]
    }
    const updated = waitFor(u.socket, 'channels:layout', (l) => l.categories[0]?.id === b.id)
    expect(await owner.socket.emitWithAck('channel:layout', next)).toEqual({ ok: true })
    const [update] = await updated
    expect(update.categories.map((c) => [c.id, c.position])).toEqual([
      [b.id, 0],
      [a.id, 1]
    ])
    expect(update.channels.find((c) => c.id === first!.id)).toEqual({ id: first!.id, categoryId: a.id, position: next.channels.length - 1 })
    expect(await currentLayout(owner)).toEqual(next)
    await owner.socket.emitWithAck('channel:layout', { categories: [b.id, a.id], channels: layout.channels })
  })

  it('ordem incompleta, repetida ou com categoria desconhecida é recusada', async () => {
    const layout = await currentLayout(owner)
    const invalid = { ok: false, error: 'A lista de canais mudou. Tente de novo.' }
    expect(await owner.socket.emitWithAck('channel:layout', { ...layout, channels: layout.channels.slice(1) })).toEqual(invalid)
    expect(await owner.socket.emitWithAck('channel:layout', { ...layout, channels: [...layout.channels, layout.channels[0]!] })).toEqual(invalid)
    expect(
      await owner.socket.emitWithAck('channel:layout', {
        ...layout,
        channels: layout.channels.map((c) => ({ ...c, categoryId: crypto.randomUUID() }))
      })
    ).toEqual(invalid)
    expect(await currentLayout(owner)).toEqual(layout)
  })

  it('canal privado não vaza no aviso para quem não o vê', async () => {
    const secret = await server.createChannel('secreto-layout')
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: secret.id,
      overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] }]
    })
    const viewer = await user('Comum')
    const layout = await currentLayout(owner)
    const reversed = { ...layout, channels: [...layout.channels].reverse() }

    const toViewer = waitFor(viewer.socket, 'channels:layout')
    const toOwner = waitFor(owner.socket, 'channels:layout')
    expect(await owner.socket.emitWithAck('channel:layout', reversed)).toEqual({ ok: true })
    const [seen] = await toViewer
    expect(seen.channels.map((c) => c.id)).not.toContain(secret.id)
    expect(seen.channels).toHaveLength(layout.channels.length - 1)
    const [all] = await toOwner
    expect(all.channels.map((c) => c.id)).toContain(secret.id)
    await removeChannel(secret.id)
  })
})
