// Tipos compartilhados entre o servidor (Node) e o app (renderer).

export type ChannelType = 'text' | 'voice'

export interface Channel {
  id: string
  name: string
  type: ChannelType
  createdAt: number
}

export interface User {
  /** id da conexão (socket.id). Usado em presença, voz e "digitando". */
  id: string
  /** id da conta (o mesmo em todas as conexões da pessoa) */
  accountId: string
  name: string
  /** identificador de 1 a 5 caracteres; a pessoa aparece como `nome#tag` */
  tag: string
  color: string
  /** caminho da foto no servidor (ex.: `/avatars/<id>?v=2`) ou null */
  avatarUrl: string | null
}

/** Dados da própria conta (só o dono recebe). */
export interface AccountInfo {
  id: string
  email: string
  name: string
  tag: string
  color: string
  avatarUrl: string | null
  hasPassword: boolean
  hasGoogle: boolean
  /**
   * O id (tag) é imutável. Só fica `false` em contas criadas pelo Google, que
   * recebem um id provisório e podem escolher o definitivo uma única vez.
   */
  tagLocked: boolean
}

// ---------- Autenticação (HTTP, antes de abrir o socket) ----------

export const NAME_MAX = 32
export const TAG_MAX = 5
export const TAG_PATTERN = /^[a-zA-Z0-9]{1,5}$/
export const PASSWORD_MIN = 8
/** tamanho máximo da foto (data URL) aceita pelo servidor */
export const AVATAR_MAX_BYTES = 400_000

/** GET /auth/config */
export interface AuthConfig {
  /** client id OAuth do Google (tipo "App para computador") ou null se não configurado */
  googleClientId: string | null
}

/** POST /auth/register */
export interface RegisterRequest {
  email: string
  password: string
  name: string
  tag: string
}

/** POST /auth/login */
export interface LoginRequest {
  email: string
  password: string
}

/** POST /auth/google — código obtido pelo app no fluxo loopback + PKCE */
export interface GoogleLoginRequest {
  code: string
  codeVerifier: string
  redirectUri: string
}

/** Resposta de register/login/google. O token vai no handshake do socket (`auth: { token }`). */
export type AuthResult = { ok: true; token: string; account: AccountInfo } | { ok: false; error: string }

/**
 * Evento `account:update`: `avatar` = data URL (trocar), null (remover) ou ausente (manter).
 * `tag` só é aceito enquanto `tagLocked` for false (e trava o id em seguida).
 */
export interface ProfileUpdate {
  name: string
  tag?: string
  avatar?: string | null
}
export type ProfileUpdateResult = { ok: true; account: AccountInfo } | { ok: false; error: string }

export interface Message {
  id: string
  channelId: string
  author: User
  content: string
  createdAt: number
}

export interface VoiceState {
  userId: string
  channelId: string
  muted: boolean
  deafened: boolean
}

export interface ServerState {
  channels: Channel[]
  users: User[]
  voice: VoiceState[]
}

export interface IceCandidate {
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

export type SignalData =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: IceCandidate }

export type CreateChannelResult = { ok: true; channel: Channel } | { ok: false; error: string }
export type JoinVoiceResult = { ok: true; peers: string[] } | { ok: false; error: string }

export interface ServerToClientEvents {
  'channel:created': (channel: Channel) => void
  'channel:deleted': (channelId: string) => void
  'user:joined': (user: User) => void
  'user:left': (userId: string) => void
  /** nome/tag/foto de uma conta mudou (vale para todas as conexões dela) */
  'user:updated': (payload: { accountId: string; name: string; tag: string; avatarUrl: string | null }) => void
  'message:new': (message: Message) => void
  'voice:state': (voice: VoiceState[]) => void
  'voice:signal': (payload: { from: string; data: SignalData }) => void
  'voice:peer-left': (userId: string) => void
  typing: (payload: { channelId: string; userId: string; name: string }) => void
}

export interface ClientToServerEvents {
  /** O socket só conecta com um token válido (`auth: { token }`); o hello devolve o estado inicial. */
  hello: (ack: (res: { self: User; account: AccountInfo; state: ServerState }) => void) => void
  'account:update': (payload: ProfileUpdate, ack: (res: ProfileUpdateResult) => void) => void
  'channel:create': (
    payload: { name: string; type: ChannelType },
    ack: (res: CreateChannelResult) => void
  ) => void
  'channel:delete': (channelId: string) => void
  'message:history': (channelId: string, ack: (messages: Message[]) => void) => void
  'message:send': (payload: { channelId: string; content: string }) => void
  'voice:join': (
    payload: { channelId: string; muted: boolean; deafened: boolean },
    ack: (res: JoinVoiceResult) => void
  ) => void
  'voice:leave': () => void
  'voice:update': (payload: { muted: boolean; deafened: boolean }) => void
  'voice:signal': (payload: { to: string; data: SignalData }) => void
  typing: (channelId: string) => void
}
