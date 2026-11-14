// Quem está online e o estado inicial enviado no `hello`.
import type { AccountInfo, User } from './account'
import type { Channel } from './channel'
import type { VoiceState } from './voice'

export interface ServerState {
  channels: Channel[]
  users: User[]
  voice: VoiceState[]
}

// ---------- Eventos ----------

export interface PresenceServerEvents {
  'user:joined': (user: User) => void
  'user:left': (userId: string) => void
}

export interface PresenceClientEvents {
  /** O socket só conecta com um token válido (`auth: { token }`); o hello devolve o estado inicial. */
  hello: (ack: (res: { self: User; account: AccountInfo; state: ServerState }) => void) => void
}
