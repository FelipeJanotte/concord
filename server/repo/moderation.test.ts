// Repo do silêncio pelo servidor (B6) sobre o banco de verdade.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { accounts } from '../db/schema'
import { openTestDatabase } from '../tests/database'
import { insertAccount } from './accounts'
import { listServerMutes, setServerMute } from './moderation'

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
  return (
    await insertAccount({
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
  ).id
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
