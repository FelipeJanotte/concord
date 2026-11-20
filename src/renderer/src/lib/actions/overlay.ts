import {
  cleanShortcuts,
  cleanWidth,
  DEFAULT_OVERLAY_CONFIG,
  DEFAULT_OVERLAY_SHORTCUTS,
  OVERLAY_CORNERS,
  OVERLAY_MAX_MEMBERS,
  OVERLAY_SHORTCUT_ACTIONS,
  OVERLAY_SIZES,
  shortcutFromKey,
  type OverlayBridge,
  type OverlayConfig,
  type OverlayPosition,
  type OverlayCorner,
  type OverlayRoom,
  type OverlayShortcutAction,
  type OverlayShortcuts,
  type OverlaySize,
  type ShortcutKeyEvent
} from '@shared/overlay'
import { useApp, type AppState } from '@/store'
import { get, notify, resolveServerUrl, set } from '../core'

export const OVERLAY_KEY = 'concord:overlay'

export const overlayEnv = {
  bridge: (): OverlayBridge | null => (typeof window !== 'undefined' ? (window.api?.overlay ?? null) : null)
}

type St = Pick<AppState, 'myVoiceChannelId' | 'voice' | 'users' | 'speaking' | 'serverUrl'>

export function overlayRoom(st: St): OverlayRoom | null {
  const channelId = st.myVoiceChannelId
  if (!channelId) return null
  const states = st.voice.filter((v) => v.channelId === channelId && st.speaking[v.userId])
  const members = states.map((v) => {
    const user = st.users.find((u) => u.id === v.userId)
    return {
      id: v.userId,
      name: user?.name ?? 'Alguém',
      avatarUrl: resolveServerUrl(user?.avatarUrl, st.serverUrl) ?? null,
      color: user?.color ?? '#5865f2',
      speaking: true,
      muted: v.muted,
      deafened: v.deafened
    }
  })
  return { members: members.slice(0, OVERLAY_MAX_MEMBERS), more: Math.max(0, members.length - OVERLAY_MAX_MEMBERS) }
}

export function overlayConfig(
  st: Pick<AppState, 'overlayEnabled' | 'overlayCorner' | 'overlaySize' | 'overlayPosition' | 'overlayWidth'>
): OverlayConfig {
  return { enabled: st.overlayEnabled, corner: st.overlayCorner, size: st.overlaySize, position: st.overlayPosition, width: st.overlayWidth }
}

type SavedOverlay = Partial<OverlayConfig> & { shortcuts?: unknown }

function save(): void {
  try {
    const saved: SavedOverlay = { ...overlayConfig(get()), shortcuts: get().overlayShortcuts }
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(saved))
  } catch {
  }
}

export function loadOverlayPreferences(): void {
  let raw: SavedOverlay = {}
  try {
    raw = JSON.parse(localStorage.getItem(OVERLAY_KEY) ?? '{}') as SavedOverlay
  } catch {
    raw = {}
  }
  set({
    overlayEnabled: raw.enabled === true,
    overlayCorner: OVERLAY_CORNERS.includes(raw.corner as OverlayCorner) ? (raw.corner as OverlayCorner) : DEFAULT_OVERLAY_CONFIG.corner,
    overlaySize: OVERLAY_SIZES.includes(raw.size as OverlaySize) ? (raw.size as OverlaySize) : DEFAULT_OVERLAY_CONFIG.size,
    overlayPosition: validPosition(raw.position),
    overlayWidth: cleanWidth(raw.width),
    overlayShortcuts: cleanShortcuts(raw.shortcuts)
  })
}

function validPosition(raw: unknown): OverlayPosition | null {
  const p = raw as Partial<OverlayPosition> | null | undefined
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  return p && ok(p.x) && ok(p.y) ? { x: Math.round(p.x), y: Math.round(p.y) } : null
}

export function setOverlayEnabled(enabled: boolean): void {
  set({ overlayEnabled: enabled })
  save()
}

export function setOverlayCorner(corner: OverlayCorner): void {
  set({ overlayCorner: corner, overlayPosition: null })
  save()
}

export function setOverlayEditing(editing: boolean): void {
  const bridge = overlayEnv.bridge()
  if (!bridge) return
  syncOverlay()
  bridge.setEditing(editing)
}

function overlayMoved(raw: unknown): void {
  const position = validPosition(raw)
  if (!position) return
  set({ overlayPosition: position })
  save()
}

export function setOverlaySize(size: OverlaySize): void {
  set({ overlaySize: size, overlayWidth: null })
  save()
}

function overlayResized(raw: unknown): void {
  const width = cleanWidth(raw)
  if (width === null) return
  set({ overlayWidth: width })
  save()
}

function applyOverlayShortcuts(): void {
  void overlayEnv
    .bridge()
    ?.setShortcuts(get().overlayShortcuts)
    .then((status) => set({ overlayShortcutTaken: OVERLAY_SHORTCUT_ACTIONS.filter((action) => !status[action]) }))
}

function setOverlayShortcuts(shortcuts: OverlayShortcuts): void {
  set({ overlayShortcuts: shortcuts, overlayRecording: null })
  save()
  applyOverlayShortcuts()
}

const ALREADY_USED_BY: Record<OverlayShortcutAction, string> = {
  toggle: 'Esse atalho já liga e desliga a sobreposição.',
  edit: 'Esse atalho já é o do modo de mover.'
}

export function startOverlayShortcutRecording(action: OverlayShortcutAction): void {
  set({ overlayRecording: action })
  overlayEnv.bridge()?.pauseShortcuts(true)
}

export function cancelOverlayShortcutRecording(): void {
  if (!get().overlayRecording) return
  set({ overlayRecording: null })
  overlayEnv.bridge()?.pauseShortcuts(false)
}

export function recordOverlayShortcutKey(event: ShortcutKeyEvent & { key: string }): void {
  const action = get().overlayRecording
  if (!action) return
  if (event.key === 'Escape') return cancelOverlayShortcutRecording()
  const accelerator = shortcutFromKey(event)
  if (!accelerator) return
  const other: OverlayShortcutAction = action === 'toggle' ? 'edit' : 'toggle'
  const current = get().overlayShortcuts
  if (accelerator === current[other]) return notify(ALREADY_USED_BY[other])
  setOverlayShortcuts({ ...current, [action]: accelerator })
}

export function resetOverlayShortcuts(): void {
  setOverlayShortcuts({ ...DEFAULT_OVERLAY_SHORTCUTS })
}

let lastConfig = ''
let lastRoom = ''
let lastTheme = ''
let stop: (() => void) | null = null

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
  if (!st.preferencesLoaded) return
  const themeJson = JSON.stringify(st.theme)
  if (themeJson !== lastTheme) {
    lastTheme = themeJson
    bridge.setTheme(st.theme)
  }
}

export function startOverlay(): () => void {
  if (stop) return stop
  loadOverlayPreferences()
  const unsubscribe = useApp.subscribe(syncOverlay)
  const bridge = overlayEnv.bridge()
  const unToggle = bridge?.onToggled((enabled) => setOverlayEnabled(enabled)) ?? null
  const unEditing = bridge?.onEditing((editing) => set({ overlayEditing: editing === true })) ?? null
  const unMoved = bridge?.onMoved(overlayMoved) ?? null
  const unResized = bridge?.onResized(overlayResized) ?? null
  syncOverlay()
  applyOverlayShortcuts()
  stop = () => {
    unsubscribe()
    unToggle?.()
    unEditing?.()
    unMoved?.()
    unResized?.()
    set({ overlayEditing: false })
    stop = null
    lastConfig = lastRoom = lastTheme = ''
  }
  return stop
}
