/**
 * Ponto de entrada das ações do app: login/sessão, conexão Socket.IO e
 * reexporta as ações de cada domínio (`lib/actions/*`).
 * Os componentes leem o estado via `useApp` e chamam funções importadas daqui.
 *
 * Domínio novo: crie `lib/actions/<dominio>.ts` com `bind<Dominio>Events(s)`,
 * chame-o em `connect()` e acrescente o `export *` no fim deste arquivo.
 */
import { io } from 'socket.io-client'
import type { AuthConfig, AuthResult, LoginRequest, RegisterRequest } from '@shared/types'
import { initialState } from '@/store'
import { bindAccountEvents } from './actions/account'
import { bindChannelEvents, firstTextView } from './actions/channels'
import { bindMessageEvents, loadHistory } from './actions/messages'
import { bindPresenceEvents } from './actions/presence'
import { bindVoiceEvents } from './actions/voice'
import { baseUrl, get, getSocket, notify, set, setSocket, type AppSocket } from './core'
import { voice } from './voice'

// ---------- Contas (HTTP) ----------

const SERVER_KEY = 'concord:server'
const TOKEN_KEY = 'concord:token'
export const DEFAULT_SERVER = 'http://localhost:3001'

export function savedServerUrl(): string {
  return localStorage.getItem(SERVER_KEY) ?? DEFAULT_SERVER
}

async function http<T>(url: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(baseUrl(url) + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch {
    throw new Error('Não foi possível conectar. Confira o endereço e se o servidor está rodando (npm run server).')
  }
  if (!res.ok && res.status !== 400) throw new Error(`O servidor respondeu com erro (${res.status})`)
  return (await res.json()) as T
}

export function getAuthConfig(url: string): Promise<AuthConfig> {
  return http<AuthConfig>(url, '/auth/config')
}

/** Guarda o token e abre a conexão em tempo real. */
async function startSession(url: string, result: AuthResult): Promise<void> {
  if (!result.ok) throw new Error(result.error)
  const server = baseUrl(url)
  localStorage.setItem(SERVER_KEY, server)
  localStorage.setItem(TOKEN_KEY, result.token)
  await connect(server, result.token)
}

export async function register(url: string, req: RegisterRequest): Promise<void> {
  await startSession(url, await http<AuthResult>(url, '/auth/register', req))
}

export async function login(url: string, req: LoginRequest): Promise<void> {
  await startSession(url, await http<AuthResult>(url, '/auth/login', req))
}

export async function loginWithGoogle(url: string): Promise<void> {
  const { googleClientId } = await getAuthConfig(url)
  if (!googleClientId) throw new Error('Login com Google não está configurado neste servidor')
  let code: Awaited<ReturnType<typeof window.api.googleSignIn>>
  try {
    code = await window.api.googleSignIn(googleClientId)
  } catch (err) {
    // O Electron prefixa "Error invoking remote method ...: Error: " na mensagem.
    const msg = err instanceof Error ? err.message.replace(/^.*?Error: /, '') : ''
    throw new Error(msg || 'Falha no login com Google')
  }
  await startSession(url, await http<AuthResult>(url, '/auth/google', code))
}

/** Ao abrir o app: entra direto se houver uma sessão salva. */
export async function restoreSession(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token || get().self || get().restoring) return
  set({ restoring: true })
  try {
    await connect(savedServerUrl(), token)
  } catch {
    // token inválido/expirado ou servidor fora do ar: mostra o login
  } finally {
    set({ restoring: false })
  }
}

export function logout(): void {
  const token = localStorage.getItem(TOKEN_KEY)
  const url = get().serverUrl
  localStorage.removeItem(TOKEN_KEY)
  if (token && url) void http(url, '/auth/logout', { token }).catch(() => {})
  disconnect()
}

// ---------- Conexão ----------

export function connect(url: string, token: string): Promise<void> {
  const { restoring } = get()
  disconnect()
  set({ status: 'connecting', serverUrl: url, restoring })

  const s: AppSocket = io(url, {
    transports: ['websocket'],
    reconnectionDelayMax: 5000,
    timeout: 8000,
    auth: { token }
  })
  setSocket(s)
  voice.setSocket(s)

  bindAccountEvents(s)
  bindPresenceEvents(s)
  bindChannelEvents(s)
  bindMessageEvents(s)
  bindVoiceEvents(s)

  return new Promise((resolve, reject) => {
    let settled = false

    s.on('connect', () => {
      s.emit('hello', ({ self, account, state }) => {
        const prev = get().view
        const keep =
          prev && state.channels.some((c) => c.id === prev.channelId) ? prev : firstTextView(state.channels)
        set({
          status: 'connected',
          self,
          account,
          channels: state.channels,
          users: state.users,
          voice: state.voice,
          messages: {},
          unread: {},
          typing: {},
          speaking: {},
          myVoiceChannelId: null,
          view: keep
        })
        if (keep?.kind === 'text') void loadHistory(keep.channelId)
        if (!settled) {
          settled = true
          resolve()
        }
      })
    })

    s.on('connect_error', (err) => {
      const unauthorized = err.message === 'unauthorized'
      if (unauthorized) localStorage.removeItem(TOKEN_KEY)
      if (settled) {
        // Sessão revogada/expirada durante uma reconexão: volta para o login.
        if (unauthorized) {
          disconnect()
          notify('Sua sessão expirou. Entre de novo.')
        }
        return
      }
      settled = true
      disconnect()
      reject(unauthorized ? new Error('Sua sessão expirou. Entre de novo.') : err)
    })

    s.on('disconnect', () => {
      if (getSocket() !== s) return
      voice.teardown()
      set({ status: 'reconnecting', myVoiceChannelId: null, speaking: {}, noMic: false })
    })
  })
}

export function disconnect(): void {
  const s = getSocket()
  setSocket(null)
  voice.teardown()
  voice.setSocket(null)
  if (s) {
    s.removeAllListeners()
    s.disconnect()
  }
  set({ ...initialState })
}

// ---------- Ações por domínio ----------

export { notify } from './core'
export type { AppSocket } from './core'
export * from './actions/account'
export * from './actions/channels'
export * from './actions/messages'
export * from './actions/voice'
