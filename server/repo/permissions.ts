// Cargos, cargos de cada conta e regras por canal (o cálculo fica em src/shared/types/permissions.ts).
import { asc, eq } from 'drizzle-orm'
import {
  DEFAULT_EVERYONE_PERMISSIONS,
  EVERYONE_ROLE_ID,
  type AccessState,
  type ChannelOverride,
  type ChannelPermission,
  type MemberRoles,
  type Permission,
  type Role
} from '../../src/shared/types'
import { db } from '../db/client'
import { accounts, channelOverrides, memberRoles, roles } from '../db/schema'

type RoleRow = typeof roles.$inferSelect

const toRole = (row: RoleRow): Role => ({
  id: row.id,
  name: row.name,
  color: row.color,
  position: row.position,
  permissions: row.permissions as Permission[]
})

/** Garante que o cargo @todos existe (id fixo, posição 0). */
export async function ensureEveryoneRole(): Promise<void> {
  await db()
    .insert(roles)
    .values({ id: EVERYONE_ROLE_ID, name: '@todos', color: null, position: 0, permissions: DEFAULT_EVERYONE_PERMISSIONS })
    .onConflictDoNothing()
}

/** Tudo que define o acesso. A dona é a primeira conta criada ('' se ainda não há contas). */
export async function loadAccess(): Promise<AccessState> {
  const [owner] = await db()
    .select({ id: accounts.id })
    .from(accounts)
    .orderBy(asc(accounts.createdAt), asc(accounts.id))
    .limit(1)
  const roleRows = await db().select().from(roles).orderBy(asc(roles.position), asc(roles.name))
  const memberRows = await db().select().from(memberRoles)
  const overrideRows = await db().select().from(channelOverrides)

  const byAccount = new Map<string, string[]>()
  for (const m of memberRows) byAccount.set(m.accountId, [...(byAccount.get(m.accountId) ?? []), m.roleId])
  const members: MemberRoles[] = [...byAccount].map(([accountId, roleIds]) => ({ accountId, roleIds }))
  const overrides: ChannelOverride[] = overrideRows.map((o) => ({
    channelId: o.channelId,
    roleId: o.roleId,
    allow: o.allow as ChannelPermission[],
    deny: o.deny as ChannelPermission[]
  }))
  return { ownerAccountId: owner?.id ?? '', roles: roleRows.map(toRole), members, overrides }
}

export async function insertRole(role: Role): Promise<Role> {
  const [row] = await db().insert(roles).values(role).returning()
  return toRole(row)
}

export async function updateRole(id: string, patch: Partial<Omit<Role, 'id'>>): Promise<Role | undefined> {
  const [row] = await db().update(roles).set(patch).where(eq(roles.id, id)).returning()
  return row && toRole(row)
}

/** Apaga o cargo (os vínculos com contas e canais saem junto, por cascade). */
export async function deleteRole(id: string): Promise<boolean> {
  const rows = await db().delete(roles).where(eq(roles.id, id)).returning({ id: roles.id })
  return rows.length > 0
}

/** Muda as posições de vários cargos de uma vez. */
export async function setRolePositions(positions: Map<string, number>): Promise<void> {
  await db().transaction(async (tx) => {
    for (const [id, position] of positions) await tx.update(roles).set({ position }).where(eq(roles.id, id))
  })
}

/** Substitui os cargos de uma conta. */
export async function setMemberRoles(accountId: string, roleIds: string[]): Promise<void> {
  await db().transaction(async (tx) => {
    await tx.delete(memberRoles).where(eq(memberRoles.accountId, accountId))
    if (roleIds.length) await tx.insert(memberRoles).values(roleIds.map((roleId) => ({ accountId, roleId })))
  })
}

/** Substitui todas as regras de um canal. */
export async function setChannelOverrides(
  channelId: string,
  list: { roleId: string; allow: ChannelPermission[]; deny: ChannelPermission[] }[]
): Promise<void> {
  await db().transaction(async (tx) => {
    await tx.delete(channelOverrides).where(eq(channelOverrides.channelId, channelId))
    if (list.length) await tx.insert(channelOverrides).values(list.map((o) => ({ channelId, ...o })))
  })
}
