/**
 * Cargos e permissões (v2): eventos do contrato em src/shared/types/permissions.ts.
 *
 * Regras de quem pode o quê:
 * - cargos: exige `manageRoles` e só mexe em cargo ABAIXO do seu cargo mais alto
 *   (a dona e quem tem Administrador podem tudo); ninguém dá a um cargo permissão global que não tem;
 * - membros: exige `assignRoles` ou `manageMembers`; só atribui/tira cargos abaixo do seu, em
 *   qualquer membro menos a dona e a si mesmo;
 * - regras por canal: exige `manageChannels`.
 * Depois de cada mudança: `access:updated` para todos, `channels:visible` para
 * quem passou a ver/deixou de ver canais, e quem perdeu `connect` sai da voz.
 */
import { randomUUID } from 'node:crypto'
import {
  accessFor,
  can,
  canAssignRole,
  canChangeAnyMemberRoles,
  canChangeMemberRoles,
  canGrantPermissions,
  canManageRole,
  CHANNEL_PERMISSIONS,
  EVERYONE_ROLE_ID,
  GLOBAL_PERMISSIONS,
  hasFullAccess,
  highestPosition,
  reorderableRoles,
  reorderedPositions,
  type AccessState,
  type ChannelPermission,
  type OkResult,
  type Permission,
  type Role
} from '../../src/shared/types'
import { currentAccess, initAccess, reloadAccess, visibleChannels } from '../access'
import { guard, type AppServer, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { findAccount } from '../repo/accounts'
import { findChannel, listChannels } from '../repo/channels'
import {
  deleteRole,
  insertRole,
  setChannelOverrides,
  setMemberRoles,
  setRolePositions,
  updateRole
} from '../repo/permissions'
import { isUuid } from '../repo/util'
import { applyVoiceAccess } from './voice'

const MAX_ROLES = 50
const NAME_MAX = 32
const ALL_PERMISSIONS = new Set<string>([...GLOBAL_PERMISSIONS, ...CHANNEL_PERMISSIONS])
const CHANNEL_SET = new Set<string>(CHANNEL_PERMISSIONS)

// ---------- validação ----------

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX)
  return name && name !== '@todos' ? name : null
}

/** null = sem cor; undefined = inválida */
function cleanColor(raw: unknown): string | null | undefined {
  if (raw === null) return null
  if (typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase()
  return undefined
}

function cleanPermissions<T extends string>(raw: unknown, allowedSet: Set<string>): T[] | null {
  if (!Array.isArray(raw) || !raw.every((p) => typeof p === 'string' && allowedSet.has(p))) return null
  return [...new Set(raw as T[])]
}

// ---------- regras de hierarquia ----------

const isOwner = (access: AccessState, accountId: string): boolean => accountId === access.ownerAccountId

const ONLY_FULL_ACCESS = 'Só a dona ou um administrador mexe em cargos com Administrador'

function roleRefusal(access: AccessState, actorId: string, role: Role, hierarchyError: string): string {
  return role.permissions.includes('administrator') && !hasFullAccess(access, actorId) ? ONLY_FULL_ACCESS : hierarchyError
}

// ---------- aplicar mudanças ----------

/** Recarrega o acesso e avisa quem precisa saber. `before` = estado antes da mudança. */
export async function applyAccessChange(io: AppServer, before: AccessState): Promise<AccessState> {
  const after = await reloadAccess()
  const channels = await listChannels()
  const channelIds = channels.map((c) => c.id)
  for (const socket of io.sockets.sockets.values()) {
    const user = socket.data.user
    if (!user) continue
    // cada um recebe só as regras dos canais que vê
    socket.emit('access:updated', accessFor(after, user.accountId, channelIds))
    const was = visibleChannels(before, user.accountId, channels).map((c) => c.id).join()
    const now = visibleChannels(after, user.accountId, channels)
    if (now.map((c) => c.id).join() !== was) socket.emit('channels:visible', now)
  }
  // sai da sala quem perdeu acesso; todos recebem o voice:state das salas que veem
  applyVoiceAccess(io, after)
  return after
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

export const permissionsModule: ServerModule = {
  async init() {
    await initAccess()
  },

  socket(io, socket) {
    const actor = (): string | null => socket.data.user?.accountId ?? null

    socket.on('access:get', (ack) => {
      if (typeof ack !== 'function') return
      void guard('access:get', async () => {
        const me = actor()
        if (!me) return ack({ ownerAccountId: '', roles: [], members: [], overrides: [] })
        const channels = await listChannels()
        ack(accessFor(await currentAccess(), me, channels.map((c) => c.id)))
      })
    })

    socket.on('role:create', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('role:create', async () => {
        const me = actor()
        if (!me) return ack(fail('Não autenticado'))
        const access = await currentAccess()
        if (!can(access, me, 'manageRoles')) return ack(fail('Você não tem permissão para gerenciar cargos'))
        const name = cleanName(payload?.name)
        if (!name) return ack(fail('Dê um nome ao cargo (até 32 caracteres)'))
        const color = cleanColor(payload?.color ?? null)
        if (color === undefined) return ack(fail('Cor inválida'))
        const permissions = cleanPermissions<Permission>(payload?.permissions ?? [], ALL_PERMISSIONS)
        if (!permissions) return ack(fail('Permissões inválidas'))
        // cargo novo nunca é o @todos; a regra é a do contrato
        if (!canGrantPermissions(access, me, '', permissions)) return ack(fail('Você não pode dar permissões que não tem'))
        if (access.roles.length >= MAX_ROLES) return ack(fail('Limite de cargos atingido'))

        let position: number
        if (isOwner(access, me)) {
          position = Math.max(0, ...access.roles.map((r) => r.position)) + 1
        } else {
          // entra logo abaixo do cargo mais alto de quem cria (que sobe uma posição, junto com os de cima)
          const mine = highestPosition(access, me)
          if (mine <= 0) return ack(fail('Você precisa ter um cargo para criar cargos'))
          await setRolePositions(new Map(access.roles.filter((r) => r.position >= mine).map((r) => [r.id, r.position + 1])))
          position = mine
        }
        const role = await insertRole({ id: randomUUID(), name, color, position, permissions })
        await applyAccessChange(io, access)
        ack({ ok: true, role })
      })
    })

    socket.on('role:update', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('role:update', async () => {
        const me = actor()
        if (!me) return ack(fail('Não autenticado'))
        const access = await currentAccess()
        if (!can(access, me, 'manageRoles')) return ack(fail('Você não tem permissão para gerenciar cargos'))
        const role = access.roles.find((r) => r.id === payload?.id)
        if (!role) return ack(fail('Cargo não encontrado'))
        if (!canManageRole(access, me, role)) return ack(fail(roleRefusal(access, me, role, 'Você só pode alterar cargos abaixo do seu')))

        const patch: Partial<Omit<Role, 'id'>> = {}
        if (role.id === EVERYONE_ROLE_ID && (payload.name !== undefined || payload.color !== undefined)) {
          return ack(fail('No @todos só dá para mudar as permissões'))
        }
        if (payload.name !== undefined) {
          const name = cleanName(payload.name)
          if (!name) return ack(fail('Dê um nome ao cargo (até 32 caracteres)'))
          patch.name = name
        }
        if (payload.color !== undefined) {
          const color = cleanColor(payload.color)
          if (color === undefined) return ack(fail('Cor inválida'))
          patch.color = color
        }
        if (payload.permissions !== undefined) {
          const permissions = cleanPermissions<Permission>(payload.permissions, ALL_PERMISSIONS)
          if (!permissions) return ack(fail('Permissões inválidas'))
          if (!canGrantPermissions(access, me, role.id, permissions)) {
            return ack(
              fail(
                role.id === EVERYONE_ROLE_ID && !isOwner(access, me)
                  ? 'Só a dona pode dar permissões de administração ao @todos'
                  : 'Você não pode dar permissões que não tem'
              )
            )
          }
          patch.permissions = permissions
        }
        const updated = (await updateRole(role.id, patch)) ?? role
        await applyAccessChange(io, access)
        ack({ ok: true, role: updated })
      })
    })

    socket.on('role:delete', (roleId, ack) => {
      if (typeof ack !== 'function') return
      void guard('role:delete', async () => {
        const me = actor()
        if (!me) return ack(fail('Não autenticado'))
        const access = await currentAccess()
        if (!can(access, me, 'manageRoles')) return ack(fail('Você não tem permissão para gerenciar cargos'))
        if (roleId === EVERYONE_ROLE_ID) return ack(fail('O @todos não pode ser apagado'))
        const role = access.roles.find((r) => r.id === roleId)
        if (!role) return ack(fail('Cargo não encontrado'))
        if (!canManageRole(access, me, role)) return ack(fail(roleRefusal(access, me, role, 'Você só pode apagar cargos abaixo do seu')))
        await deleteRole(role.id)
        await applyAccessChange(io, access)
        ack({ ok: true } satisfies OkResult)
      })
    })

    socket.on('role:reorder', (roleIds, ack) => {
      if (typeof ack !== 'function') return
      void guard('role:reorder', async () => {
        const me = actor()
        if (!me) return ack(fail('Não autenticado'))
        const access = await currentAccess()
        if (!can(access, me, 'manageRoles')) return ack(fail('Você não tem permissão para gerenciar cargos'))
        const limited = limiters.roleReorder.take(me)
        if (!limited.ok) return ack(fail(`Muitas alterações seguidas. ${retryText(limited.retryAfterMs)}`))
        const movable = new Set(reorderableRoles(access, me).map((r) => r.id))
        const ids: unknown[] = Array.isArray(roleIds) ? roleIds : []
        if (ids.some((id) => access.roles.some((r) => r.id === id) && !movable.has(id as string))) {
          return ack(fail('Você só pode mover cargos abaixo do seu'))
        }
        const positions = reorderedPositions(access, me, roleIds)
        if (!positions) return ack(fail('Lista de cargos inválida'))
        await setRolePositions(positions)
        await applyAccessChange(io, access)
        ack({ ok: true })
      })
    })

    socket.on('member:set-roles', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('member:set-roles', async () => {
        const me = actor()
        if (!me) return ack(fail('Não autenticado'))
        const access = await currentAccess()
        if (!canChangeAnyMemberRoles(access, me)) return ack(fail('Você não tem permissão para alterar cargos dos membros'))
        const target = typeof payload?.accountId === 'string' ? await findAccount(payload.accountId) : undefined
        if (!target) return ack(fail('Conta não encontrada'))
        const requested = Array.isArray(payload.roleIds) ? [...new Set(payload.roleIds)] : null
        const known = new Map(access.roles.filter((r) => r.id !== EVERYONE_ROLE_ID).map((r) => [r.id, r]))
        if (!requested || !requested.every((id) => typeof id === 'string' && known.has(id))) {
          return ack(fail('Cargos inválidos'))
        }

        if (!canChangeMemberRoles(access, me, target.id)) {
          if (target.id === me) return ack(fail('Você não pode alterar os próprios cargos'))
          return ack(fail('Você não pode alterar os cargos da dona da comunidade'))
        }
        const current = access.members.find((m) => m.accountId === target.id)?.roleIds ?? []
        const changed = new Set([...requested.filter((id) => !current.includes(id)), ...current.filter((id) => !requested.includes(id))])
        const refused = access.roles.find((role) => changed.has(role.id) && !canAssignRole(access, me, role))
        if (refused) return ack(fail(roleRefusal(access, me, refused, 'Você só pode dar ou tirar cargos abaixo do seu')))
        await setMemberRoles(target.id, requested)
        await applyAccessChange(io, access)
        ack({ ok: true })
      })
    })

    socket.on('channel:set-overrides', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('channel:set-overrides', async () => {
        const me = actor()
        if (!me) return ack(fail('Não autenticado'))
        const access = await currentAccess()
        if (!can(access, me, 'manageChannels')) return ack(fail('Você não tem permissão para gerenciar canais'))
        const channel = typeof payload?.channelId === 'string' ? await findChannel(payload.channelId) : undefined
        // conversa privada não tem regras por cargo (só os dois membros veem)
        if (!channel || channel.type === 'dm') return ack(fail('Canal não encontrado'))
        if (!Array.isArray(payload.overrides)) return ack(fail('Regras inválidas'))

        const roleIds = new Set(access.roles.map((r) => r.id))
        const seen = new Set<string>()
        const list: { roleId: string; allow: ChannelPermission[]; deny: ChannelPermission[] }[] = []
        for (const o of payload.overrides) {
          const allow = cleanPermissions<ChannelPermission>(o?.allow ?? [], CHANNEL_SET)
          const deny = cleanPermissions<ChannelPermission>(o?.deny ?? [], CHANNEL_SET)
          if (!o || !isUuid(o.roleId) || !roleIds.has(o.roleId) || seen.has(o.roleId) || !allow || !deny) {
            return ack(fail('Regras inválidas'))
          }
          if (allow.some((p) => deny.includes(p))) return ack(fail('Uma permissão não pode ser liberada e negada ao mesmo tempo'))
          seen.add(o.roleId)
          if (allow.length || deny.length) list.push({ roleId: o.roleId, allow, deny })
        }
        await setChannelOverrides(channel.id, list)
        await applyAccessChange(io, access)
        ack({ ok: true })
      })
    })
  }
}
