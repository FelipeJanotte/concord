/**
 * Conexão com o servidor (Socket.IO) e todas as ações do app.
 * Os componentes leem o estado via `useApp` e chamam estas funções.
 */
import { io, type Socket } from 'socket.io-client'
import type {
  AuthConfig,
  AuthResult,
  Channel,
  ChannelType,
  ClientToServerEvents,
  LoginRequest,
  ProfileUpdate,
  RegisterRequest,
  ServerToClientEvents
} from '@shared/types'
import { initialState, useApp, type View } from '@/store'
import { omit } from './utils'
import { voice } from './voice'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: AppSocket | null = null
const set = useApp.setState
const get = useApp.getState

function requireSocket(): AppSocket {
  if (!socket) throw new Error('Sem conexão com o servidor')
  return socket
}

export function notify(text: string, kind: 'error' | 'info' = 'error'): void {
  set({ notice: { id: Date.now(), text, kind } })
}

function firstTextView(channels: Channel[]): View | null {
  const channel = channels.find((c) => c.type === 'text')
  return channel ? { kind: 'text', channelId: channel.id } : null
}

// ---------- Contas (HTTP) ----------

const SERVER_KEY = 'concord:server'
const TOKEN_KEY = 'concord:token'
export const DEFAULT_SERVER = 'http://localhost:3001'

export function savedServerUrl(): string {
  return localStorage.getItem(SERVER_KEY) ?? DEFAULT_SERVER
}

const baseUrl = (url: string): string => url.trim().replace(/\/+$/, '')

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

export async function updateProfile(update: ProfileUpdate): Promise<void> {
  const res = await requireSocket().emitWithAck('account:update', update)
  if (!res.ok) throw new Error(res.error)
  set({ account: res.account })
}

/** Endereço completo da foto de perfil (o servidor devolve só o caminho). */
export function resolveAvatarUrl(path: string | null | undefined, serverUrl: string | null): string | undefined {
  if (!path) return undefined
  if (/^(https?:|data:|blob:)/.test(path)) return path
  return serverUrl ? baseUrl(serverUrl) + path : undefined
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
  socket = s
  voice.setSocket(s)

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
      if (socket !== s) return
      voice.teardown()
      set({ status: 'reconnecting', myVoiceChannelId: null, speaking: {}, noMic: false })
    })

    s.on('channel:created', (channel) => set((st) => ({ channels: [...st.channels, channel] })))

    s.on('channel:deleted', (channelId) => {
      if (get().myVoiceChannelId === channelId) leaveVoice()
      set((st) => {
        const channels = st.channels.filter((c) => c.id !== channelId)
        return {
          channels,
          messages: omit(st.messages, channelId),
          unread: omit(st.unread, channelId),
          view: st.view?.channelId === channelId ? firstTextView(channels) : st.view
        }
      })
      const view = get().view
      if (view?.kind === 'text') void loadHistory(view.channelId)
    })

    s.on('user:joined', (user) => set((st) => ({ users: [...st.users.filter((u) => u.id !== user.id), user] })))
    s.on('user:left', (userId) => set((st) => ({ users: st.users.filter((u) => u.id !== userId) })))

    s.on('user:updated', ({ accountId, ...profile }) =>
      set((st) => ({
        users: st.users.map((u) => (u.accountId === accountId ? { ...u, ...profile } : u)),
        self: st.self?.accountId === accountId ? { ...st.self, ...profile } : st.self,
        account: st.account?.id === accountId ? { ...st.account, ...profile } : st.account
      }))
    )

    s.on('message:new', (message) =>
      set((st) => {
        const list = st.messages[message.channelId]
        const isActive = st.view?.kind === 'text' && st.view.channelId === message.channelId
        const typingInChannel = st.typing[message.channelId]
        return {
          messages: list ? { ...st.messages, [message.channelId]: [...list, message] } : st.messages,
          unread:
            !isActive && message.author.id !== st.self?.id ? { ...st.unread, [message.channelId]: true } : st.unread,
          typing: typingInChannel?.[message.author.id]
            ? { ...st.typing, [message.channelId]: omit(typingInChannel, message.author.id) }
            : st.typing
        }
      })
    )

    s.on('typing', ({ channelId, userId, name: who }) =>
      set((st) => ({
        typing: { ...st.typing, [channelId]: { ...st.typing[channelId], [userId]: { name: who, until: Date.now() + 3500 } } }
      }))
    )

    s.on('voice:state', (states) => set({ voice: states }))
    s.on('voice:signal', (payload) => void voice.handleSignal(payload))
    s.on('voice:peer-left', (userId) => voice.removePeer(userId))
  })
}

export function disconnect(): void {
  const s = socket
  socket = null
  voice.teardown()
  voice.setSocket(null)
  if (s) {
    s.removeAllListeners()
    s.disconnect()
  }
  set({ ...initialState })
}

// ---------- Texto ----------

const loadingHistory = new Set<string>()

export async function loadHistory(channelId: string): Promise<void> {
  if (!socket || get().messages[channelId] || loadingHistory.has(channelId)) return
  loadingHistory.add(channelId)
  try {
    const messages = await socket.emitWithAck('message:history', channelId)
    set((st) => ({ messages: { ...st.messages, [channelId]: messages } }))
  } catch {
    notify('Não foi possível carregar as mensagens')
  } finally {
    loadingHistory.delete(channelId)
  }
}

export function selectTextChannel(channelId: string): void {
  set((st) => ({ view: { kind: 'text', channelId }, unread: omit(st.unread, channelId) }))
  void loadHistory(channelId)
}

let lastTypingAt = 0

export function sendMessage(channelId: string, content: string): void {
  const text = content.trim()
  if (!text) return
  requireSocket().emit('message:send', { channelId, content: text })
  lastTypingAt = 0
}

export function notifyTyping(channelId: string): void {
  const now = Date.now()
  if (now - lastTypingAt < 2500) return
  lastTypingAt = now
  socket?.emit('typing', channelId)
}

// ---------- Canais ----------

export async function createChannel(name: string, type: ChannelType): Promise<Channel> {
  const res = await requireSocket().emitWithAck('channel:create', { name, type })
  if (!res.ok) throw new Error(res.error)
  return res.channel
}

export function deleteChannel(channelId: string): void {
  requireSocket().emit('channel:delete', channelId)
}

// ---------- Voz ----------

function describeMediaError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Permissão de microfone negada.'
    if (err.name === 'NotFoundError') return 'Nenhum microfone encontrado.'
    if (err.name === 'NotReadableError') return 'O microfone está sendo usado por outro programa.'
  }
  return err instanceof Error ? err.message : 'Falha ao entrar no canal de voz'
}

export async function joinVoice(channelId: string): Promise<void> {
  const st = get()
  set({ view: { kind: 'voice', channelId } })
  if (st.myVoiceChannelId === channelId || st.joiningVoice) return
  set({ joiningVoice: true })
  try {
    const { micError } = await voice.join(channelId)
    set({ myVoiceChannelId: channelId, noMic: micError !== null })
    if (micError !== null) {
      notify(`${describeMediaError(micError)} Você entrou só para ouvir.`, 'info')
    }
  } catch (err) {
    notify(describeMediaError(err))
  } finally {
    set({ joiningVoice: false })
  }
}

export function leaveVoice(): void {
  voice.leave()
  set({ myVoiceChannelId: null, speaking: {}, noMic: false })
}

function applyAudio(muted: boolean, deafened: boolean): void {
  set({ muted, deafened })
  voice.setMuted(muted)
  voice.setDeafened(deafened)
  // Sem microfone, os outros sempre veem o usuário como silenciado.
  if (get().myVoiceChannelId) socket?.emit('voice:update', { muted: muted || get().noMic, deafened })
}

export function toggleMute(): void {
  const { muted, deafened, noMic } = get()
  if (noMic) {
    if (deafened) applyAudio(muted, false)
    else notify('Nenhum microfone disponível. Saia e entre de novo na sala depois de conectá-lo.', 'info')
    return
  }
  if (deafened) applyAudio(false, false)
  else applyAudio(!muted, false)
}

export function toggleDeafen(): void {
  const { deafened } = get()
  applyAudio(!deafened, !deafened)
}
