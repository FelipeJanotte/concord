// Contas, perfil e autenticação.

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

// ---------- Eventos ----------

export interface AccountServerEvents {
  /** nome/tag/foto de uma conta mudou (vale para todas as conexões dela) */
  'user:updated': (payload: { accountId: string; name: string; tag: string; avatarUrl: string | null }) => void
}

export interface AccountClientEvents {
  'account:update': (payload: ProfileUpdate, ack: (res: ProfileUpdateResult) => void) => void
}
