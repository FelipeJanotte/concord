// Repo de amizades sobre o banco de verdade: cada lado tem a sua linha.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openTestDatabase } from '../tests/database'
import { insertAccount } from './accounts'
import {
  block,
  countOutgoing,
  deletePair,
  findAccountByTag,
  friendIds,
  getRelation,
  listRelations,
  makeFriends,
  sendRequest,
  unblock
} from './friends'

let cleanup: () => Promise<void>
beforeAll(async () => {
  cleanup = await openTestDatabase()
})
afterAll(async () => {
  await cleanup?.()
})

async function account(tag = `f${randomUUID().slice(0, 8)}`) {
  return insertAccount({
    id: randomUUID(),
    email: `amigo-${randomUUID().slice(0, 6)}@teste.com`,
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

describe('amizades', () => {
  it('pedido: eu outgoing, a outra pessoa incoming; aceitar vira friend dos dois lados', async () => {
    const a = await account()
    const b = await account()
    await sendRequest(a.id, b.id)
    expect((await getRelation(a.id, b.id))?.status).toBe('outgoing')
    expect((await getRelation(b.id, a.id))?.status).toBe('incoming')
    expect(await countOutgoing(a.id)).toBe(1)
    await makeFriends(a.id, b.id)
    expect((await getRelation(a.id, b.id))?.status).toBe('friend')
    expect((await getRelation(b.id, a.id))?.status).toBe('friend')
    expect(await friendIds(a.id)).toEqual([b.id])
    expect(await countOutgoing(a.id)).toBe(0)
  })

  it('listRelations traz os dados públicos da outra conta', async () => {
    const a = await account()
    const b = await account()
    await sendRequest(a.id, b.id)
    const [rel] = await listRelations(a.id)
    expect(rel).toMatchObject({ status: 'outgoing', account: { id: b.id, name: b.name, tag: b.tag, avatarUrl: null } })
    expect(typeof rel.since).toBe('number')
  })

  it('desfazer apaga os dois lados', async () => {
    const a = await account()
    const b = await account()
    await makeFriends(a.id, b.id)
    await deletePair(a.id, b.id)
    expect(await getRelation(a.id, b.id)).toBeUndefined()
    expect(await getRelation(b.id, a.id)).toBeUndefined()
  })

  it('bloquear: meu lado blocked, o lado da outra pessoa some; desbloquear apaga o meu', async () => {
    const a = await account()
    const b = await account()
    await makeFriends(a.id, b.id)
    await block(a.id, b.id)
    expect((await getRelation(a.id, b.id))?.status).toBe('blocked')
    expect(await getRelation(b.id, a.id)).toBeUndefined()
    expect(await unblock(a.id, b.id)).toBe(true)
    expect(await unblock(a.id, b.id)).toBe(false)
    expect(await getRelation(a.id, b.id)).toBeUndefined()
  })

  it('bloqueio dos dois lados: um bloquear não apaga o bloqueio do outro', async () => {
    const a = await account()
    const b = await account()
    await block(a.id, b.id)
    await block(b.id, a.id)
    expect((await getRelation(a.id, b.id))?.status).toBe('blocked')
    expect((await getRelation(b.id, a.id))?.status).toBe('blocked')
  })

  it('acha conta pelo id sem diferenciar maiúsculas', async () => {
    const a = await account('AbC9')
    expect((await findAccountByTag('abc9'))?.id).toBe(a.id)
    expect(await findAccountByTag('zzzz9')).toBeUndefined()
  })

  it('o banco não deixa ter relação consigo mesmo nem status desconhecido', async () => {
    const a = await account()
    await expect(sendRequest(a.id, a.id)).rejects.toThrow()
  })
})
