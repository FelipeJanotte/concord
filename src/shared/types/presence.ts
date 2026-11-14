// Quem está online e o estado inicial enviado no `hello`.
import type { AccountInfo, User } from './account'
import type { Channel } from './channel'
import type { AccessState } from './permissions'
import type { VoiceState } from './voice'

export interface ServerState {
  /** só os canais que a pessoa pode ver */
  channels: Channel[]
  users: User[]
  /** só as salas que a pessoa pode ver */
  voice: VoiceState[]
  /** cargos, membros e as regras dos canais visíveis (`accessFor`) — evita a tela "piscar" sem permissões */
  access: AccessState
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
