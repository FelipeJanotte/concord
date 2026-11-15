// Repo de cargos/regras sobre o banco de verdade (PGlite em memória ou Postgres com DATABASE_URL_TEST).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_EVERYONE_PERMISSIONS, EVERYONE_ROLE_ID, type Role } from '../../src/shared/types'
import { openTestDatabase } from '../tests/database'
import { insertAccount } from './accounts'
import { deleteChannel, insertChannel } from './channels'
import {
  deleteRole,
  ensureEveryoneRole,
  insertRole,
  loadAccess,
  setChannelOverrides,
  setMemberRoles,
  setRolePositions,
  updateRole
} from './permissions'

let cleanup: () => Promise<void>
beforeAll(async () => {
  cleanup = await openTestDatabase()
})
afterAll(async () => {
  await cleanup?.()
})

let n = 0
async function account(createdAt = Date.now()) {
  n++
  return insertAccount({
    id: randomUUID(),
    email: `perm${n}-${randomUUID().slice(0, 6)}@teste.com`,
    name: `Pessoa ${n}`,
    tag: `p${randomUUID().slice(0, 8)}`,
    tagLocked: true,
    color: '#5865f2',
    passwordHash: null,
    googleId: null,
    avatarType: null,
    avatarVersion: 0,
    createdAt
  })
}

const role = (over: Partial<Role> = {}): Role => ({
  id: randomUUID(),
  name: `cargo-${randomUUID().slice(0, 5)}`,
  color: null,
  position: 1,
  permissions: [],
  ...over
})

async function channel() {
  const c = { id: randomUUID(), name: `c-${randomUUID().slice(0, 8)}`, type: 'text' as const, createdAt: Date.now() }
  await insertChannel(c)
  return c
}

describe('estado de acesso', () => {
  it('sem contas: dona vazia; @todos é criado uma vez só com as permissões padrão', async () => {
    expect((await loadAccess()).ownerAccountId).toBe('')
    await ensureEveryoneRole()
    await ensureEveryoneRole()
    const everyone = (await loadAccess()).roles.filter((r) => r.id === EVERYONE_ROLE_ID)
    expect(everyone).toEqual([{ id: EVERYONE_ROLE_ID, name: '@todos', color: null, position: 0, permissions: DEFAULT_EVERYONE_PERMISSIONS }])
  })

  it('a dona é a primeira conta criada', async () => {
    const first = await account(1000)
    await account(2000)
    expect((await loadAccess()).ownerAccountId).toBe(first.id)
  })

  it('cargos em ordem de posição, membros agrupados e regras por canal', async () => {
    const a = await account()
    const ch = await channel()
    const low = await insertRole(role({ position: 5, permissions: ['manageMembers'] }))
    const high = await insertRole(role({ position: 6, color: '#ff00aa' }))
    await setMemberRoles(a.id, [high.id, low.id])
    await setChannelOverrides(ch.id, [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] }, { roleId: high.id, allow: ['view'], deny: [] }])

    const access = await loadAccess()
    const positions = access.roles.map((r) => r.position)
    expect(positions).toEqual([...positions].sort((x, y) => x - y))
    expect(access.roles.find((r) => r.id === high.id)).toEqual(high)
    expect(access.members.find((m) => m.accountId === a.id)?.roleIds.sort()).toEqual([high.id, low.id].sort())
    expect(access.overrides.filter((o) => o.channelId === ch.id)).toEqual(
      expect.arrayContaining([
        { channelId: ch.id, roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] },
        { channelId: ch.id, roleId: high.id, allow: ['view'], deny: [] }
      ])
    )
  })
})

describe('mudanças', () => {
  it('setMemberRoles e setChannelOverrides substituem tudo (inclusive esvaziar)', async () => {
    const a = await account()
    const ch = await channel()
    const r1 = await insertRole(role())
    const r2 = await insertRole(role())
    await setMemberRoles(a.id, [r1.id])
    await setMemberRoles(a.id, [r2.id])
    expect((await loadAccess()).members.find((m) => m.accountId === a.id)?.roleIds).toEqual([r2.id])
    await setMemberRoles(a.id, [])
    expect((await loadAccess()).members.find((m) => m.accountId === a.id)).toBeUndefined()

    await setChannelOverrides(ch.id, [{ roleId: r1.id, allow: ['send'], deny: [] }])
    await setChannelOverrides(ch.id, [])
    expect((await loadAccess()).overrides.filter((o) => o.channelId === ch.id)).toEqual([])
  })

  it('apagar cargo leva junto os vínculos; apagar canal leva as regras', async () => {
    const a = await account()
    const ch = await channel()
    const r = await insertRole(role())
    await setMemberRoles(a.id, [r.id])
    await setChannelOverrides(ch.id, [{ roleId: r.id, allow: ['view'], deny: [] }])
    expect(await deleteRole(r.id)).toBe(true)
    expect(await deleteRole(r.id)).toBe(false)
    let access = await loadAccess()
    expect(access.members.some((m) => m.roleIds.includes(r.id))).toBe(false)
    expect(access.overrides.some((o) => o.roleId === r.id)).toBe(false)

    await setChannelOverrides(ch.id, [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['send'] }])
    await deleteChannel(ch.id)
    access = await loadAccess()
    expect(access.overrides.some((o) => o.channelId === ch.id)).toBe(false)
  })

  it('atualiza campos e posições', async () => {
    const r = await insertRole(role({ position: 10 }))
    expect(await updateRole(r.id, { name: 'Novo', color: '#00ff00', permissions: ['manageRoles'] })).toEqual({
      ...r,
      name: 'Novo',
      color: '#00ff00',
      permissions: ['manageRoles']
    })
    await setRolePositions(new Map([[r.id, 42]]))
    expect((await loadAccess()).roles.find((x) => x.id === r.id)?.position).toBe(42)
    expect(await updateRole(randomUUID(), { name: 'x' })).toBeUndefined()
  })

  it('o banco recusa nome vazio ou longo, cor inválida e posição negativa', async () => {
    await expect(insertRole(role({ name: '' }))).rejects.toThrow()
    await expect(insertRole(role({ name: 'x'.repeat(33) }))).rejects.toThrow()
    await expect(insertRole(role({ color: 'vermelho' }))).rejects.toThrow()
    await expect(insertRole(role({ color: '#FFFFFF' }))).rejects.toThrow() // só minúsculas (o servidor normaliza)
    await expect(insertRole(role({ position: -1 }))).rejects.toThrow()
  })
})
