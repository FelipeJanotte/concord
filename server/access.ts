/**
 * Estado de acesso (cargos, cargos de cada conta, regras por canal) em memória,
 * mais as verificações usadas pelos módulos. A regra de cálculo é a do contrato
 * (`can` em src/shared/types/permissions.ts), a mesma que a tela usa.
 *
 * O cache é recarregado do banco depois de cada mudança (um único processo).
 */
import {
  can,
  CHANNEL_PERMISSIONS,
  type AccessState,
  type Channel,
  type ChannelPermission,
  type Permission,
  type ServerToClientEvents
} from '../src/shared/types'
import type { AppServer } from './context'
import { listDmMembers } from './repo/dms'
import { blockedBetween } from './repo/friends'
import { ensureEveryoneRole, loadAccess } from './repo/permissions'

let state: AccessState = { ownerAccountId: '', roles: [], members: [], overrides: [] }

/**
 * Conversas privadas (v3): id do canal `dm` → as duas contas. Nelas cargos e regras não valem
 * (nem para a dona): só os membros veem. Cache em memória, carregado no boot e atualizado por `rememberDm`.
 */
const dmMembers = new Map<string, readonly [string, string]>()

/** Cria o @todos se faltar e carrega tudo do banco. */
export async function initAccess(): Promise<AccessState> {
  await ensureEveryoneRole()
  await reloadDms()
  return reloadAccess()
}

export async function reloadDms(): Promise<void> {
  const byChannel = new Map<string, string[]>()
  for (const { channelId, accountId } of await listDmMembers()) {
    byChannel.set(channelId, [...(byChannel.get(channelId) ?? []), accountId])
  }
  dmMembers.clear()
  for (const [channelId, [a, b]] of byChannel) if (a && b) dmMembers.set(channelId, [a, b])
}

/** Registra uma conversa recém-criada no cache. */
export function rememberDm(channelId: string, a: string, b: string): void {
  dmMembers.set(channelId, [a, b])
}

/** As duas contas da conversa (ou undefined se o canal não é um DM). */
export function dmMembersOf(channelId: string): readonly [string, string] | undefined {
  return dmMembers.get(channelId)
}

/** Num DM, ver é só ser membro; as outras permissões de canal também exigem que ninguém tenha bloqueado. */
async function allowedInDm(members: readonly [string, string], accountId: string, permission: Permission): Promise<boolean> {
  if (!members.includes(accountId)) return false
  if (!(CHANNEL_PERMISSIONS as readonly string[]).includes(permission)) return false
  if ((permission as ChannelPermission) === 'view') return true
  const other = members[0] === accountId ? members[1] : members[0]
  return !(await blockedBetween(accountId, other))
}

export async function reloadAccess(): Promise<AccessState> {
  state = await loadAccess()
  return state
}

/**
 * Estado atual. Enquanto não existe a primeira conta (a dona), recarrega:
 * assim quem se cadastra primeiro já vira dona sem reiniciar o servidor.
 */
export async function currentAccess(): Promise<AccessState> {
  if (!state.ownerAccountId) await reloadAccess()
  return state
}

/** Estado em cache, sem recarregar (para quem precisa ser síncrono, como o `voice:state`). */
export function accessSnapshot(): AccessState {
  return state
}

/** A conta tem a permissão? (de canal exige `channelId`) */
export async function allowed(accountId: string, permission: Permission, channelId?: string): Promise<boolean> {
  const dm = channelId ? dmMembers.get(channelId) : undefined
  if (dm) return allowedInDm(dm, accountId, permission)
  return can(await currentAccess(), accountId, permission, channelId)
}

/** Só os canais da comunidade que a conta pode ver (conversas privadas nunca entram aqui). */
export function visibleChannels(access: AccessState, accountId: string, channels: Channel[]): Channel[] {
  return channels.filter((c) => c.type !== 'dm' && !dmMembers.has(c.id) && can(access, accountId, 'view', c.id))
}

type Event = keyof ServerToClientEvents

type Payload<E extends Event> = Parameters<ServerToClientEvents[E]>[0]

/**
 * Emite só para as conexões que podem ver o canal (opcionalmente menos uma).
 * `forAccount` adapta o payload para cada conta (ex.: links de anexo assinados por pessoa).
 */
export async function emitToViewers<E extends Event>(
  io: AppServer,
  channelId: string,
  event: E,
  payload: Payload<E>,
  { exceptSocketId, forAccount }: { exceptSocketId?: string; forAccount?: (payload: Payload<E>, accountId: string) => Payload<E> } = {}
): Promise<void> {
  const access = await currentAccess()
  const dm = dmMembers.get(channelId)
  const sees = (accountId: string): boolean => (dm ? dm.includes(accountId) : can(access, accountId, 'view', channelId))
  for (const socket of io.sockets.sockets.values()) {
    const user = socket.data.user
    if (!user || socket.id === exceptSocketId || !sees(user.accountId)) continue
    const data = forAccount ? forAccount(payload, user.accountId) : payload
    ;(socket.emit as (ev: string, data: unknown) => boolean)(event, data)
  }
}
