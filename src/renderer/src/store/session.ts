// Conexão, conta logada, quem está online e avisos (toast).
import type { AccountInfo, PresenceStatus, User } from '@shared/types'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface Notice {
  id: number
  text: string
  kind: 'error' | 'info'
}

export interface SessionState {
  status: ConnectionStatus
  serverUrl: string | null
  self: User | null
  /** dados da própria conta (e-mail, nome#tag, foto) */
  account: AccountInfo | null
  /** tentando entrar com a sessão salva ao abrir o app */
  restoring: boolean
  /** usuários online (uma entrada por conexão) */
  users: User[]
  statuses: Record<string, PresenceStatus>
  notice: Notice | null
}

export const sessionInitial: SessionState = {
  status: 'disconnected',
  serverUrl: null,
  self: null,
  account: null,
  restoring: false,
  users: [],
  statuses: {},
  notice: null
}
