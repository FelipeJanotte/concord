
import type { ThemeConfig } from './types/theme'

export const OVERLAY_CORNERS =['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type OverlayCorner = (typeof OVERLAY_CORNERS)[number]

export const OVERLAY_SIZES = ['small', 'medium', 'large'] as const
export type OverlaySize = (typeof OVERLAY_SIZES)[number]

export interface OverlayPosition {
  x: number
  y: number
}

export interface OverlayConfig {
  enabled: boolean
  corner: OverlayCorner
  size: OverlaySize
  position: OverlayPosition | null
  width: number | null
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = { enabled: false, corner: 'top-left', size: 'medium', position: null, width: null }

export const OVERLAY_SHORTCUT_ACTIONS = ['toggle', 'edit'] as const
export type OverlayShortcutAction = (typeof OVERLAY_SHORTCUT_ACTIONS)[number]
export type OverlayShortcuts = Record<OverlayShortcutAction, string>
export type OverlayShortcutStatus = Record<OverlayShortcutAction, boolean>

export const DEFAULT_OVERLAY_SHORTCUTS: OverlayShortcuts = { toggle: 'Shift+`', edit: 'CommandOrControl+Shift+`' }

const SHORTCUT_MODIFIERS = ['CommandOrControl', 'Ctrl', 'Alt', 'Shift', 'Super']
const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/
const NAMED_KEYS: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}
const NAMED_SHORTCUT_KEYS = new Set(Object.values(NAMED_KEYS))
const LABELS: Record<string, string> = { CommandOrControl: 'Ctrl', Super: 'Win', Space: 'Espaço' }

export interface ShortcutKeyEvent {
  code: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

function keyFromCode(code: string): string | null {
  const letterOrDigit = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code)
  if (letterOrDigit) return letterOrDigit[1] ?? letterOrDigit[2]
  const numpad = /^Numpad([0-9])$/.exec(code)
  if (numpad) return `num${numpad[1]}`
  if (FUNCTION_KEY.test(code)) return code
  return NAMED_KEYS[code] ?? null
}

function isShortcutKey(key: string): boolean {
  return /^[A-Z0-9]$/.test(key) || /^num[0-9]$/.test(key) || FUNCTION_KEY.test(key) || NAMED_SHORTCUT_KEYS.has(key)
}

export function shortcutFromKey(event: ShortcutKeyEvent): string | null {
  const key = keyFromCode(event.code)
  if (!key) return null
  const pressed = { Ctrl: event.ctrlKey, Alt: event.altKey, Shift: event.shiftKey, Super: event.metaKey }
  const modifiers = Object.entries(pressed)
    .filter(([, down]) => down)
    .map(([name]) => name)
  if (modifiers.length === 0 && !FUNCTION_KEY.test(key)) return null
  return [...modifiers, key].join('+')
}

export function cleanShortcut(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 64) return null
  const modifiers = raw.split('+')
  const key = modifiers.pop() ?? ''
  if (!isShortcutKey(key)) return null
  if (modifiers.some((m) => !SHORTCUT_MODIFIERS.includes(m)) || new Set(modifiers).size !== modifiers.length) return null
  if (modifiers.length === 0 && !FUNCTION_KEY.test(key)) return null
  return raw
}

export function cleanShortcuts(raw: unknown): OverlayShortcuts {
  const r = raw as Partial<OverlayShortcuts> | null
  const toggle = cleanShortcut(r?.toggle) ?? DEFAULT_OVERLAY_SHORTCUTS.toggle
  const edit = cleanShortcut(r?.edit) ?? DEFAULT_OVERLAY_SHORTCUTS.edit
  return toggle === edit ? { ...DEFAULT_OVERLAY_SHORTCUTS } : { toggle, edit }
}

export function shortcutLabel(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => LABELS[part] ?? part)
    .join(' + ')
}

export const OVERLAY_MAX_MEMBERS = 12

export const OVERLAY_METRICS: Record<OverlaySize, { width: number; line: number; avatar: number }> = {
  small: { width: 200, line: 26, avatar: 20 },
  medium: { width: 250, line: 34, avatar: 28 },
  large: { width: 320, line: 44, avatar: 36 }
}
export const OVERLAY_GAP = 4
export const OVERLAY_PADDING = 8

export const OVERLAY_MIN_WIDTH = 140
export const OVERLAY_MAX_WIDTH = 640

export function overlayWidth(config: Pick<OverlayConfig, 'size' | 'width'>): number {
  return config.width ?? OVERLAY_METRICS[config.size].width
}

export function cleanWidth(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return Math.round(Math.min(Math.max(raw, OVERLAY_MIN_WIDTH), OVERLAY_MAX_WIDTH))
}

export function overlayHeight(size: OverlaySize, lines: number): number {
  const n = Math.max(1, lines)
  return OVERLAY_PADDING * 2 + n * OVERLAY_METRICS[size].line + (n - 1) * OVERLAY_GAP
}

export interface OverlayMember {
  id: string
  name: string
  avatarUrl: string | null
  color: string
  speaking: boolean
  muted: boolean
  deafened: boolean
}

export interface OverlayRoom {
  members: OverlayMember[]
  more: number
}

export interface OverlayBridge {
  setConfig: (config: OverlayConfig) => void
  setRoom: (room: OverlayRoom | null) => void
  onToggled: (listener: (enabled: boolean) => void) => () => void
  startEditing: () => void
  finishEditing: () => void
  onEditing: (listener: (editing: boolean) => void) => () => void
  onMoved: (listener: (position: OverlayPosition) => void) => () => void
  onResized: (listener: (width: number) => void) => () => void
  setShortcuts: (shortcuts: OverlayShortcuts) => Promise<OverlayShortcutStatus>
  pauseShortcuts: () => void
  resumeShortcuts: () => void
  setTheme: (theme: ThemeConfig) => void
}

export interface OverlayViewBridge {
  onUpdate: (listener: (room: OverlayRoom | null, config: OverlayConfig, editing: boolean) => void) => () => void
  finishEditing: () => void
  resizing: (width: number) => void
  resized: (width: number) => void
  onTheme: (listener: (theme: ThemeConfig) => void) => () => void
}
