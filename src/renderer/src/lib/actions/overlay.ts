/**
 * Sobreposição em jogos (overlay, B15), lado da janela principal: guarda a preferência desta
 * máquina (`concord:overlay`), manda a configuração para o processo principal e, a cada mudança
 * da store, o estado da minha sala de voz (quem está, quem fala, mute/deafen). O atalho global
 * (Shift + `) chega por `onToggled` e vira a mesma preferência. Modo de mover (Ctrl + Shift + ` ou
 * `setOverlayEditing`): o processo principal avisa por `onEditing` e, ao soltar, manda a posição por
 * `onMoved` (salva em `position`; escolher um canto volta para o canto). Fora do Electron, não faz nada.
 * Skill `concord-overlay`.
 */
import {
  DEFAULT_OVERLAY_CONFIG,
  OVERLAY_CORNERS,
  OVERLAY_MAX_MEMBERS,
  OVERLAY_SIZES,
  type OverlayBridge,
  type OverlayConfig,
  type OverlayPosition,
  type OverlayCorner,
  type OverlayRoom,
  type OverlaySize
} from '@shared/overlay'
import { useApp, type AppState } from '@/store'
import { get, resolveServerUrl, set } from '../core'

export const OVERLAY_KEY = 'concord:overlay'

export const overlayEnv = {
  bridge: (): OverlayBridge | null => (typeof window !== 'undefined' ? (window.api?.overlay ?? null) : null)
}

type St = Pick<AppState, 'myVoiceChannelId' | 'voice' | 'users' | 'speaking' | 'serverUrl'>

/** O que o overlay mostra: quem está na minha sala de voz (sem o nome da sala), ou null fora de sala. */
export function overlayRoom(st: St): OverlayRoom | null {
  const channelId = st.myVoiceChannelId
  if (!channelId) return null
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
  return { members: members.slice(0, OVERLAY_MAX_MEMBERS), more: Math.max(0, members.length - OVERLAY_MAX_MEMBERS) }
}

export function overlayConfig(st: Pick<AppState, 'overlayEnabled' | 'overlayCorner' | 'overlaySize' | 'overlayPosition'>): OverlayConfig {
  return { enabled: st.overlayEnabled, corner: st.overlayCorner, size: st.overlaySize, position: st.overlayPosition }
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
    overlaySize: OVERLAY_SIZES.includes(raw.size as OverlaySize) ? (raw.size as OverlaySize) : DEFAULT_OVERLAY_CONFIG.size,
    overlayPosition: validPosition(raw.position)
  })
}

/** Posição salva/recebida válida (números finitos) ou null. */
function validPosition(raw: unknown): OverlayPosition | null {
  const p = raw as Partial<OverlayPosition> | null | undefined
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  return p && ok(p.x) && ok(p.y) ? { x: Math.round(p.x), y: Math.round(p.y) } : null
}

export function setOverlayEnabled(enabled: boolean): void {
  set({ overlayEnabled: enabled })
  save()
}

/** Escolher um canto tira a posição arrastada (volta para o canto). */
export function setOverlayCorner(corner: OverlayCorner): void {
  set({ overlayCorner: corner, overlayPosition: null })
  save()
}

/** Modo de mover (como no Discord): o overlay passa a receber o mouse para ser arrastado. */
export function setOverlayEditing(editing: boolean): void {
  const bridge = overlayEnv.bridge()
  if (!bridge) return
  // a configuração (ligado) precisa chegar antes: o processo principal só entra com o overlay ligado
  syncOverlay()
  bridge.setEditing(editing)
}

/** O processo principal avisou onde o overlay foi solto. */
function overlayMoved(raw: unknown): void {
  const position = validPosition(raw)
  if (!position) return
  set({ overlayPosition: position })
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
  const bridge = overlayEnv.bridge()
  const unToggle = bridge?.onToggled((enabled) => setOverlayEnabled(enabled)) ?? null
  const unEditing = bridge?.onEditing((editing) => set({ overlayEditing: editing === true })) ?? null
  const unMoved = bridge?.onMoved(overlayMoved) ?? null
  syncOverlay()
  stop = () => {
    unsubscribe()
    unToggle?.()
    unEditing?.()
    unMoved?.()
    set({ overlayEditing: false })
    stop = null
    lastConfig = lastRoom = ''
  }
  return stop
}
