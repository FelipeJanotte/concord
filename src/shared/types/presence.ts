// Quem está online e o estado inicial enviado no `hello`.
import type { AccountInfo, User } from './account'
import type { ChannelCategory } from './categories'
import type { Channel } from './channel'
import type { AccessState } from './permissions'
import type { VoiceState } from './voice'

export const PRESENCE_STATUSES = ['online', 'idle', 'dnd'] as const
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number]

export const ACTIVITY_STATUSES = ['online', 'idle'] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export function isActivityStatus(value: unknown): value is ActivityStatus {
  return ACTIVITY_STATUSES.includes(value as ActivityStatus)
}

export function presenceStatus(doNotDisturb: boolean, idleConnections: boolean[]): PresenceStatus {
  if (doNotDisturb) return 'dnd'
  return idleConnections.length > 0 && idleConnections.every(Boolean) ? 'idle' : 'online'
}

export interface ServerState {
  /** só os canais que a pessoa pode ver */
  channels: Channel[]
  categories?: ChannelCategory[]
  users: User[]
  /** só as salas que a pessoa pode ver */
  voice: VoiceState[]
  /** cargos, membros e as regras dos canais visíveis (`accessFor`) — evita a tela "piscar" sem permissões */
  access: AccessState
  statuses: Record<string, PresenceStatus>
}

// ---------- Eventos ----------

export interface PresenceServerEvents {
  'user:joined': (user: User) => void
  'user:left': (userId: string) => void
  'presence:status': (payload: { accountId: string; status: PresenceStatus }) => void
}

export interface PresenceClientEvents {
  /** O socket só conecta com um token válido (`auth: { token }`); o hello devolve o estado inicial. */
  hello: (ack: (res: { self: User; account: AccountInfo; state: ServerState }) => void) => void
  'presence:set-status': (status: ActivityStatus) => void
}
