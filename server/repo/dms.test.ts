// Repo das conversas privadas sobre o banco de verdade: uma conversa por par, membros e lista.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openTestDatabase } from '../tests/database'
import { insertAccount } from './accounts'
import { countChannels, deleteChannel, findChannel, insertChannel, listChannels } from './channels'
import { dmName, findDm, listDmMembers, listDms, openDm } from './dms'
import { block, blockedBetween, findFriendAccount, unblock } from './friends'

let cleanup: () => Promise<void>
beforeAll(async () => {
  cleanup = await openTestDatabase()
})
afterAll(async () => {
  await cleanup?.()
})

async function account() {
  const tag = `d${randomUUID().slice(0, 4)}`
  return insertAccount({
    id: randomUUID(),
    email: `dm-${randomUUID().slice(0, 6)}@teste.com`,
    name: `Pessoa ${tag}`,
    tag,
    tagLocked: true,
    color: '#5865f2',
    passwordHash: null,
    googleId: null,
    avatarType: null,
    avatarVersion: 0,
    createdAt: Date.now()
  })
}

describe('dmName', () => {
  it('é o mesmo para (a, b) e (b, a), cabe no limite do nome e muda de par para par', () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()]
    expect(dmName(a, b)).toBe(dmName(b, a))
    expect(dmName(a, b.toUpperCase())).toBe(dmName(a, b))
    expect(dmName(a, b)).toHaveLength(32)
    expect(dmName(a, c)).not.toBe(dmName(a, b))
  })
})

describe('conversas', () => {
  it('openDm cria uma vez (canal dm + 2 membros); depois devolve a mesma, dos dois lados', async () => {
    const a = await account()
    const b = await account()
    expect(await findDm(a.id, b.id)).toBeUndefined()
    const first = await openDm(a.id, b.id)
    expect(first.created).toBe(true)
    expect(first.channel.type).toBe('dm')
    expect(await openDm(b.id, a.id)).toEqual({ channel: first.channel, created: false })
    expect((await findChannel(first.channel.id))?.type).toBe('dm')
    const members = (await listDmMembers()).filter((m) => m.channelId === first.channel.id).map((m) => m.accountId)
    expect(members.sort()).toEqual([a.id, b.id].sort())
  })

  it('duas aberturas ao mesmo tempo: o banco garante uma conversa só', async () => {
    const a = await account()
    const b = await account()
    const results = await Promise.all([openDm(a.id, b.id), openDm(b.id, a.id), openDm(a.id, b.id)])
    expect(new Set(results.map((r) => r.channel.id)).size).toBe(1)
    expect(results.filter((r) => r.created)).toHaveLength(1)
  })

  it('listDms traz a outra pessoa, mais recente primeiro; ids inválidos não quebram', async () => {
    const a = await account()
    const b = await account()
    const c = await account()
    const ab = await openDm(a.id, b.id)
    await new Promise((r) => setTimeout(r, 5))
    const ca = await openDm(c.id, a.id)
    expect((await listDms(a.id)).map((d) => [d.channel.id, d.other.id])).toEqual([
      [ca.channel.id, c.id],
      [ab.channel.id, b.id]
    ])
    expect((await listDms(b.id))[0].other).toMatchObject({ id: a.id, name: a.name, tag: a.tag })
    expect(await listDms('lixo')).toEqual([])
    expect(await findDm(a.id, a.id)).toBeUndefined()
    expect(await findDm('lixo', a.id)).toBeUndefined()
  })

  it('conversas ficam fora da lista e do limite de canais da comunidade, e deleteChannel não apaga', async () => {
    const before = await countChannels()
    const { channel } = await openDm((await account()).id, (await account()).id)
    expect(await countChannels()).toBe(before)
    expect((await listChannels()).some((c) => c.id === channel.id)).toBe(false)
    expect(await deleteChannel(channel.id)).toBe(false)
    expect(await findChannel(channel.id)).toBeDefined()
  })

  it('o banco recusa tipo de canal desconhecido', async () => {
    await expect(
      insertChannel({ id: randomUUID(), name: 'x', type: 'grupo' as never, createdAt: Date.now() })
    ).rejects.toThrow()
  })
})

describe('apoio nas amizades', () => {
  it('blockedBetween vale para qualquer lado', async () => {
    const a = await account()
    const b = await account()
    expect(await blockedBetween(a.id, b.id)).toBe(false)
    await block(b.id, a.id)
    expect(await blockedBetween(a.id, b.id)).toBe(true)
    expect(await blockedBetween(b.id, a.id)).toBe(true)
    await unblock(b.id, a.id)
    expect(await blockedBetween(a.id, b.id)).toBe(false)
    expect(await blockedBetween('lixo', b.id)).toBe(false)
  })

  it('findFriendAccount devolve só dados públicos', async () => {
    const a = await account()
    expect(await findFriendAccount(a.id)).toEqual({ id: a.id, name: a.name, tag: a.tag, color: a.color, avatarUrl: null })
    expect(await findFriendAccount(randomUUID())).toBeUndefined()
    expect(await findFriendAccount('lixo')).toBeUndefined()
  })
})
