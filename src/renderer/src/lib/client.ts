import { io } from 'socket.io-client'
import type { AuthConfig, AuthResult, LoginRequest, RegisterRequest } from '@shared/types'
import { initialState } from '@/store'
import { bindAccountEvents } from './actions/account'
import { bindChannelEvents, firstTextView } from './actions/channels'
import { bindFriendsEvents, loadFriendsAndDms } from './actions/friends'
import { bindToolsEvents } from './actions/tools'
import { bindPreferencesEvents, loadPreferences } from './actions/preferences'
import { bindLimitEvents } from './actions/limits'
import { bindMessageEvents, loadHistory } from './actions/messages'
import { bindModerationEvents, loadTimeouts } from './actions/moderation'
import { loadOverlayPreferences } from './actions/overlay'
import { loadPushToTalkPreferences } from './actions/push-to-talk'
import { bindNotificationEvents, stopNotifications } from './actions/notifications'
import { bindCallsEvents, loadCalls } from './actions/calls'
import { bindPermissionsEvents } from './actions/permissions'
import { bindPinsEvents } from './actions/pins'
import { bindPresenceEvents, syncActivityStatus } from './actions/presence'
import { bindReactionsEvents } from './actions/reactions'
import { bindReadsEvents, loadReads } from './actions/reads'
import { bindSoundsEvents, loadSounds } from './actions/sounds'
import { bindMusicEvents } from './actions/music'
import { bindPlaylistsEvents } from './actions/playlists'
import { bindVoiceEvents, OUT_OF_VOICE } from './actions/voice'
import { clearAllDrafts } from './actions/uploads'
import { loadAudioPreferences } from './actions/devices'
import { baseUrl, get, getSocket, notify, SERVER_KEY, set, setSocket, TOKEN_KEY, type AppSocket } from './core'
import { defaultServerUrl } from './default-server'
import { voice } from './voice'

export const DEFAULT_SERVER = defaultServerUrl(import.meta.env.VITE_DEFAULT_SERVER)

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
  if (!res.ok && res.status !== 400 && res.status !== 429) throw new Error(`O servidor respondeu com erro (${res.status})`)
  return (await res.json()) as T
}

export function getAuthConfig(url: string): Promise<AuthConfig> {
  return http<AuthConfig>(url, '/auth/config')
}

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
    const msg = err instanceof Error ? err.message.replace(/^.*?Error: /, '') : ''
    throw new Error(msg || 'Falha no login com Google')
  }
  await startSession(url, await http<AuthResult>(url, '/auth/google', code))
}

export async function restoreSession(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token || get().self || get().restoring) return
  set({ restoring: true })
  await connect(savedServerUrl(), token).catch(() => undefined)
  set({ restoring: false })
}

export function cancelRestore(): void {
  disconnect()
}

export function logout(): void {
  const token = localStorage.getItem(TOKEN_KEY)
  const url = get().serverUrl
  localStorage.removeItem(TOKEN_KEY)
  if (token && url) void http(url, '/auth/logout', { token }).catch(() => {})
  disconnect()
}

const RETRY_REFUSED_CONNECTION_MS = 3000

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
  bindReactionsEvents(s)
  bindPinsEvents(s)
  bindReadsEvents(s)
  bindVoiceEvents(s)
  bindLimitEvents(s)
  bindPermissionsEvents(s)
  bindFriendsEvents(s)
  bindToolsEvents(s)
  bindPreferencesEvents(s)
  bindModerationEvents(s, disconnect)
  bindCallsEvents(s)
  bindSoundsEvents(s)
  bindMusicEvents(s)
  bindPlaylistsEvents(s)
  bindNotificationEvents(s)

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
          statuses: state.statuses ?? {},
          voice: state.voice,
          access: state.access,
          messages: {},
          hasMoreHistory: {},
          loadingOlder: {},
          unread: {},
          lastRead: {},
          readMarker: {},
          typing: {},
          speaking: {},
          myVoiceChannelId: null,
          view: keep
        })
        if (keep?.kind === 'text') void loadHistory(keep.channelId)
        void loadFriendsAndDms().catch(() => {})
        void loadReads().catch(() => {})
        void loadPreferences().catch(() => {})
        void loadCalls().catch(() => {})
        void syncActivityStatus().catch(() => {})
        void loadSounds().catch(() => {})
        void loadTimeouts().catch(() => {})
        if (!settled) {
          settled = true
          resolve()
        }
      })
    })

    s.on('connect_error', (err) => {
      if (err.message !== 'unauthorized') {
        if (!s.active) setTimeout(() => getSocket() === s && s.connect(), RETRY_REFUSED_CONNECTION_MS)
        return
      }
      localStorage.removeItem(TOKEN_KEY)
      disconnect()
      if (settled) {
        notify('Sua sessão expirou. Entre de novo.')
        return
      }
      settled = true
      reject(new Error('Sua sessão expirou. Entre de novo.'))
    })

    s.on('disconnect', () => {
      if (getSocket() !== s) return
      voice.teardown()
      set({ status: 'reconnecting', ...OUT_OF_VOICE })
    })
  })
}

export function disconnect(): void {
  const s = getSocket()
  setSocket(null)
  voice.teardown()
  voice.setSocket(null)
  clearAllDrafts()
  stopNotifications()
  if (s) {
    s.removeAllListeners()
    s.disconnect()
  }
  set({ ...initialState })
  loadAudioPreferences()
  loadOverlayPreferences()
  loadPushToTalkPreferences()
}

export { notify } from './core'
export type { AppSocket } from './core'
export * from './actions/account'
export * from './actions/channels'
export * from './actions/messages'
export * from './actions/reactions'
export * from './actions/pins'
export * from './actions/search'
export * from './actions/moderation'
export * from './actions/navigation'
export { acceptCall, cancelCall, declineCall, hangUp, startCall } from './actions/calls'
export * from './actions/permissions'
export * from './actions/uploads'
export * from './actions/voice'
export { fetchScreenPreview } from './actions/screen-preview'
export { watchScreens } from './actions/screen-watching'
export * from './actions/devices'
export * from './actions/friends'
export * from './actions/tools'
export * from './actions/preferences'
export { setDoNotDisturb } from './actions/presence'
export * from './actions/settings'
export * from './actions/sounds'
export { closeMusicQueue, dismissCollection, jumpToTrack, loadMusicQueue, openMusicQueue, pauseMusic, playMusic, resumeMusic, runMusicCommand, shuffleMusic, skipMusic, stopMusic, trackDuration } from './actions/music'
export * from './actions/playlists'
export * from './actions/overlay'
export * from './actions/updates'
export * from './actions/startup'
export * from './actions/window'
export { choosePttKey, setPttSounds, setPushToTalk } from './actions/push-to-talk'
export * from './actions/notifications'
export { previewVoiceSound } from './actions/voice-sounds'
export { resolveServerUrl } from './core'
