/**
 * Estado de acesso (cargos, cargos de cada conta, regras por canal) em memória,
 * mais as verificações usadas pelos módulos. A regra de cálculo é a do contrato
 * (`can` em src/shared/types/permissions.ts), a mesma que a tela usa.
 *
 * O cache é recarregado do banco depois de cada mudança (um único processo).
 */
import {
  can,
  type AccessState,
  type Channel,
  type Permission,
  type ServerToClientEvents
} from '../src/shared/types'
import type { AppServer } from './context'
import { ensureEveryoneRole, loadAccess } from './repo/permissions'

let state: AccessState = { ownerAccountId: '', roles: [], members: [], overrides: [] }

/** Cria o @todos se faltar e carrega tudo do banco. */
export async function initAccess(): Promise<AccessState> {
  await ensureEveryoneRole()
  return reloadAccess()
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
  return can(await currentAccess(), accountId, permission, channelId)
}

/** Só os canais que a conta pode ver. */
export function visibleChannels(access: AccessState, accountId: string, channels: Channel[]): Channel[] {
  return channels.filter((c) => can(access, accountId, 'view', c.id))
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
  for (const socket of io.sockets.sockets.values()) {
    const user = socket.data.user
    if (!user || socket.id === exceptSocketId || !can(access, user.accountId, 'view', channelId)) continue
    const data = forAccount ? forAccount(payload, user.accountId) : payload
    ;(socket.emit as (ev: string, data: unknown) => boolean)(event, data)
  }
}
