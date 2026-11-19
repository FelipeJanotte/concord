// Repo do silêncio pelo servidor (B6) sobre o banco de verdade.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { accounts } from '../db/schema'
import { openTestDatabase } from '../tests/database'
import { insertAccount } from './accounts'
import { deleteCommunityBan, findCommunityBan, insertCommunityBan, listCommunityBans, listServerMutes, listServerTimeouts, setServerMute, setServerTimeout } from './moderation'

let cleanup: () => Promise<void>
beforeAll(async () => {
  cleanup = await openTestDatabase()
})
afterAll(async () => {
  await cleanup?.()
})

// o app ainda não apaga contas: o teste apaga direto para conferir o ON DELETE
const deleteAccount = async (id: string): Promise<void> => {
  await db().delete(accounts).where(eq(accounts.id, id))
}

async function account(): Promise<string> {
  return (await fullAccount()).id
}

function fullAccount(): Promise<{ id: string; email: string }> {
  return insertAccount({
    id: randomUUID(),
    email: `mute-${randomUUID().slice(0, 6)}@teste.com`,
    name: 'Mute',
    tag: `m${randomUUID().slice(0, 8)}`,
    tagLocked: true,
    color: '#5865f2',
    passwordHash: null,
    googleId: null,
    avatarType: null,
    avatarVersion: 0,
    createdAt: Date.now()
  })
}

describe('silêncio pelo servidor no banco', () => {
  it('silenciar grava, repetir não duplica, tirar apaga', async () => {
    const mod = await account()
    const ana = await account()
    await setServerMute(ana, true, mod)
    await setServerMute(ana, true, mod)
    expect((await listServerMutes()).filter((id) => id === ana)).toHaveLength(1)
    await setServerMute(ana, false)
    await setServerMute(ana, false) // tirar de novo não dá erro
    expect(await listServerMutes()).not.toContain(ana)
  })

  it('id inválido ou conta que não existe: nada acontece', async () => {
    await setServerMute('nao-uuid', true)
    await setServerMute(randomUUID(), true)
    await setServerMute(await account(), true, 'nao-uuid') // quem silenciou inválido vira desconhecido
  })

  it('apagar a conta silenciada apaga o silêncio; apagar quem silenciou mantém', async () => {
    const mod = await account()
    const ana = await account()
    const bia = await account()
    await setServerMute(ana, true, mod)
    await setServerMute(bia, true, mod)
    await deleteAccount(mod)
    await deleteAccount(ana)
    const list = await listServerMutes()
    expect(list).not.toContain(ana)
    expect(list).toContain(bia)
  })
})

describe('banimentos no banco', () => {
  it('banir grava conta e e-mail; acha pela conta ou pelo e-mail; tirar apaga', async () => {
    const mod = await account()
    const ana = await fullAccount()
    await insertCommunityBan({ accountId: ana.id, email: ana.email, reason: 'spam', bannedBy: mod })
    await insertCommunityBan({ accountId: ana.id, email: ana.email, reason: 'outro', bannedBy: mod })
    expect(await findCommunityBan({ accountId: ana.id })).toEqual({ reason: 'spam' })
    expect(await findCommunityBan({ email: ana.email })).toEqual({ reason: 'spam' })
    expect(await findCommunityBan({ accountId: randomUUID(), email: ana.email })).toEqual({ reason: 'spam' })
    const listed = (await listCommunityBans()).find((b) => b.accountId === ana.id)
    expect(listed).toMatchObject({ accountId: ana.id, name: 'Mute', reason: 'spam' })
    expect(typeof listed?.createdAt).toBe('number')
    expect(await deleteCommunityBan(ana.id)).toBe(true)
    expect(await deleteCommunityBan(ana.id)).toBe(false)
    expect(await findCommunityBan({ accountId: ana.id, email: ana.email })).toBeUndefined()
  })

  it('id inválido ou sem nada para procurar: não acha e não quebra', async () => {
    expect(await findCommunityBan({ accountId: 'nao-uuid' })).toBeUndefined()
    expect(await findCommunityBan({})).toBeUndefined()
    expect(await deleteCommunityBan('nao-uuid')).toBe(false)
  })
})

describe('castigos no banco', () => {
  it('grava o prazo, trocar substitui, null apaga', async () => {
    const mod = await account()
    const ana = await account()
    await setServerTimeout(ana, 1_000_000, mod)
    await setServerTimeout(ana, 2_000_000, mod)
    expect((await listServerTimeouts()).filter((t) => t.accountId === ana)).toEqual([{ accountId: ana, until: 2_000_000 }])
    await setServerTimeout(ana, null)
    expect((await listServerTimeouts()).some((t) => t.accountId === ana)).toBe(false)
  })

  it('id inválido ou conta que não existe: nada acontece', async () => {
    await setServerTimeout('nao-uuid', 1_000)
    await setServerTimeout(randomUUID(), 1_000)
    expect((await listServerTimeouts()).some((t) => t.until === 1_000)).toBe(false)
  })
})
