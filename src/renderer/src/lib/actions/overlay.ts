/**
 * Sobreposição em jogos (overlay, B15), lado da janela principal: guarda a preferência desta
 * máquina (`concord:overlay`), manda a configuração para o processo principal e, a cada mudança
 * da store, o estado da minha sala de voz (quem está, quem fala, mute/deafen). O atalho global
 * (Shift + `) chega por `onToggled` e vira a mesma preferência. Fora do Electron, não faz nada.
 * Skill `concord-overlay`.
 */
import {
  DEFAULT_OVERLAY_CONFIG,
  OVERLAY_CORNERS,
  OVERLAY_MAX_MEMBERS,
  OVERLAY_SIZES,
  type OverlayBridge,
  type OverlayConfig,
  type OverlayCorner,
  type OverlayRoom,
  type OverlaySize
} from '@shared/overlay'
import { useApp, type AppState } from '@/store'
import { findDm } from '../dms'
import { get, resolveServerUrl, set } from '../core'

export const OVERLAY_KEY = 'concord:overlay'

export const overlayEnv = {
  bridge: (): OverlayBridge | null => (typeof window !== 'undefined' ? (window.api?.overlay ?? null) : null)
}

type St = Pick<AppState, 'myVoiceChannelId' | 'voice' | 'users' | 'speaking' | 'channels' | 'dms' | 'serverUrl'>

/** O que o overlay mostra: a minha sala de voz, ou null fora de sala. */
export function overlayRoom(st: St): OverlayRoom | null {
  const channelId = st.myVoiceChannelId
  if (!channelId) return null
  const dm = findDm(st.dms, channelId)
  const channelName = dm ? `Chamada com ${dm.other.name}` : (st.channels.find((c) => c.id === channelId)?.name ?? 'Sala de voz')
  const states = st.voice.filter((v) => v.channelId === channelId)
  const members = states.map((v) => {
    const user = st.users.find((u) => u.id === v.userId)
    return {
      id: v.userId,
      name: user?.name ?? 'Alguém',
      avatarUrl: resolveServerUrl(user?.avatarUrl, st.serverUrl) ?? null,
      color: user?.color ?? '#5865f2',
      speaking: !!st.speaking[v.userId],
      muted: v.muted,
      deafened: v.deafened
    }
  })
  return { channelName, members: members.slice(0, OVERLAY_MAX_MEMBERS), more: Math.max(0, members.length - OVERLAY_MAX_MEMBERS) }
}

export function overlayConfig(st: Pick<AppState, 'overlayEnabled' | 'overlayCorner' | 'overlaySize'>): OverlayConfig {
  return { enabled: st.overlayEnabled, corner: st.overlayCorner, size: st.overlaySize }
}

function save(): void {
  try {
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlayConfig(get())))
  } catch {
    // sem armazenamento: vale só até fechar o app
  }
}

/** Lê a preferência salva (valores desconhecidos voltam ao padrão). */
export function loadOverlayPreferences(): void {
  let raw: Partial<OverlayConfig> = {}
  try {
    raw = JSON.parse(localStorage.getItem(OVERLAY_KEY) ?? '{}') as Partial<OverlayConfig>
  } catch {
    raw = {}
  }
  set({
    overlayEnabled: raw.enabled === true,
    overlayCorner: OVERLAY_CORNERS.includes(raw.corner as OverlayCorner) ? (raw.corner as OverlayCorner) : DEFAULT_OVERLAY_CONFIG.corner,
    overlaySize: OVERLAY_SIZES.includes(raw.size as OverlaySize) ? (raw.size as OverlaySize) : DEFAULT_OVERLAY_CONFIG.size
  })
}

export function setOverlayEnabled(enabled: boolean): void {
  set({ overlayEnabled: enabled })
  save()
}

export function setOverlayCorner(corner: OverlayCorner): void {
  set({ overlayCorner: corner })
  save()
}

export function setOverlaySize(size: OverlaySize): void {
  set({ overlaySize: size })
  save()
}

let lastConfig = ''
let lastRoom = ''
let stop: (() => void) | null = null

/** Manda configuração e sala para o processo principal, só quando mudam. */
export function syncOverlay(): void {
  const bridge = overlayEnv.bridge()
  if (!bridge) return
  const st = get()
  const config = overlayConfig(st)
  const configJson = JSON.stringify(config)
  if (configJson !== lastConfig) {
    lastConfig = configJson
    bridge.setConfig(config)
  }
  const room = overlayRoom(st)
  const roomJson = JSON.stringify(room)
  if (roomJson !== lastRoom) {
    lastRoom = roomJson
    bridge.setRoom(room)
  }
}

/** Começa a acompanhar (uma vez, na abertura do app): store → overlay e atalho → preferência. */
export function startOverlay(): () => void {
  if (stop) return stop
  loadOverlayPreferences()
  const unsubscribe = useApp.subscribe(syncOverlay)
  const unToggle = overlayEnv.bridge()?.onToggled((enabled) => setOverlayEnabled(enabled)) ?? null
  syncOverlay()
  stop = () => {
    unsubscribe()
    unToggle?.()
    stop = null
    lastConfig = lastRoom = ''
  }
  return stop
}
