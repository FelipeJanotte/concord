// Cargos e permissões (v2): recebe o estado de acesso e manda as mudanças da tela de administração.
import type { AccessState, ChannelPermission, OkResult, Permission, Role, RoleResult } from '@shared/types'
import { requireSocket, set, type AppSocket } from '../core'

export function bindPermissionsEvents(s: AppSocket): void {
  // cargos, membros ou regras mudaram (já filtrado para esta conta)
  s.on('access:updated', (access) => set({ access }))
}

function unwrap(res: OkResult): void {
  if (!res.ok) throw new Error(res.error)
}

function unwrapRole(res: RoleResult): Role {
  if (!res.ok) throw new Error(res.error)
  return res.role
}

/** Recarrega o estado de acesso (o inicial já vem no `hello`). */
export async function reloadAccess(): Promise<AccessState> {
  const access = await requireSocket().emitWithAck('access:get')
  set({ access })
  return access
}

export async function createRole(name: string, color: string | null, permissions: Permission[]): Promise<Role> {
  return unwrapRole(await requireSocket().emitWithAck('role:create', { name: name.trim(), color, permissions }))
}

export async function updateRole(
  id: string,
  changes: { name?: string; color?: string | null; permissions?: Permission[] }
): Promise<Role> {
  const payload = changes.name === undefined ? { id, ...changes } : { id, ...changes, name: changes.name.trim() }
  return unwrapRole(await requireSocket().emitWithAck('role:update', payload))
}

export async function deleteRole(roleId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('role:delete', roleId))
}

/** `roleIds`: do menos para o mais importante, só os cargos que a pessoa pode mexer (sem o @todos). */
export async function reorderRoles(roleIds: string[]): Promise<void> {
  unwrap(await requireSocket().emitWithAck('role:reorder', roleIds))
}

/** Substitui os cargos da conta (sem o @todos). */
export async function setMemberRoles(accountId: string, roleIds: string[]): Promise<void> {
  unwrap(await requireSocket().emitWithAck('member:set-roles', { accountId, roleIds }))
}

/** Substitui todas as regras do canal. Regras vazias (nada liberado nem negado) não são enviadas. */
export async function setChannelOverrides(
  channelId: string,
  overrides: { roleId: string; allow: ChannelPermission[]; deny: ChannelPermission[] }[]
): Promise<void> {
  const useful = overrides.filter((o) => o.allow.length > 0 || o.deny.length > 0)
  unwrap(await requireSocket().emitWithAck('channel:set-overrides', { channelId, overrides: useful }))
}
