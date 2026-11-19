/**
 * Permissões na tela (v2): a mesma regra do servidor (`can` em `@shared/types`) aplicada ao
 * estado de acesso da store, para esconder o que a pessoa não pode fazer.
 * O servidor confere tudo de novo: isto é só para não mostrar botão que daria erro.
 */
import {
  can,
  canChangeAnyMemberRoles,
  canPinMessages,
  displayColor,
  EVERYONE_ROLE_ID,
  type AccessState,
  type Permission,
  type Role
} from '@shared/types'
import { useApp } from '@/store'
import { DM_PERMISSIONS, findDm } from './dms'

/** A conta tem a permissão? Sem estado de acesso ainda (antes do `hello`), não esconde nada. */
export function allows(access: AccessState | null, accountId: string | undefined, permission: Permission, channelId?: string): boolean {
  if (!access || !accountId) return true
  return can(access, accountId, permission, channelId)
}

/** Hook: eu tenho a permissão (no canal, se for de canal)? Em conversa privada só valem ver, mandar e anexar. */
export function useCan(permission: Permission, channelId?: string): boolean {
  return useApp((s) => {
    if (channelId && findDm(s.dms, channelId)) return DM_PERMISSIONS.has(permission)
    return allows(s.access, s.self?.accountId, permission, channelId)
  })
}

export function useCanPin(channelId: string): boolean {
  return useApp((s) => {
    if (findDm(s.dms, channelId)) return true
    return !!s.access && !!s.self && canPinMessages(s.access, s.self.accountId)
  })
}

/** Hook: posso abrir as configurações da comunidade (cargos ou membros)? */
export function useCanAdminister(): boolean {
  return useApp((s) => {
    if (!s.access || !s.self) return false
    const me = s.self.accountId
    return can(s.access, me, 'manageRoles') || can(s.access, me, 'banMembers') || canChangeAnyMemberRoles(s.access, me)
  })
}

/** Canal privado = o @todos tem `view` negado nele. */
export function isPrivateChannel(access: AccessState | null, channelId: string): boolean {
  return !!access?.overrides.some((o) => o.channelId === channelId && o.roleId === EVERYONE_ROLE_ID && o.deny.includes('view'))
}

/** Cargos do mais para o menos importante (@todos por último). */
export function rolesByPosition(access: AccessState | null): Role[] {
  return [...(access?.roles ?? [])].sort((a, b) => b.position - a.position)
}

/** Cargos atribuídos à conta (sem o @todos). */
export function memberRoleIds(access: AccessState | null, accountId: string): string[] {
  return access?.members.find((m) => m.accountId === accountId)?.roleIds ?? []
}

/** Cargo mais alto da conta (sem o @todos), para agrupar a lista de membros. */
export function topRole(access: AccessState | null, accountId: string): Role | null {
  const ids = new Set(memberRoleIds(access, accountId))
  const mine = (access?.roles ?? []).filter((r) => ids.has(r.id))
  return mine.length === 0 ? null : mine.reduce((a, b) => (b.position > a.position ? b : a))
}

/** Hook: cor do nome da pessoa (a do cargo mais alto com cor, ou a da conta). */
export function useNameColor(accountId: string, fallback: string): string {
  return useApp((s) => (s.access ? displayColor(s.access, accountId) : null) ?? fallback)
}
