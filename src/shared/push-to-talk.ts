
export interface PttBinding {
  kind: 'key' | 'mouse'
  code: number
  label: string
}

export interface PttConfig {
  enabled: boolean
  binding: PttBinding | null
}

export const DEFAULT_PTT_BINDING: PttBinding = { kind: 'key', code: 47, label: 'V' }

export const PTT_RELEASE_DELAY_MS = 200

export const PTT_CAPTURE_TIMEOUT_MS = 10_000

export const PTT_MOUSE_BUTTONS = [3, 4, 5] as const

export function cleanBinding(raw: unknown): PttBinding | null {
  const b = raw as Partial<PttBinding> | null
  if (!b || (b.kind !== 'key' && b.kind !== 'mouse')) return null
  if (typeof b.code !== 'number' || !Number.isInteger(b.code) || b.code <= 0 || b.code > 0xffff) return null
  if (b.kind === 'mouse' && !PTT_MOUSE_BUTTONS.includes(b.code as never)) return null
  const label = typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 32) : `Tecla ${b.code}`
  return { kind: b.kind, code: b.code, label }
}

export function cleanPttConfig(raw: unknown): PttConfig {
  const c = raw as Partial<PttConfig> | null
  return { enabled: c?.enabled === true, binding: cleanBinding(c?.binding) }
}

export type PttCapture = { kind: 'chosen'; binding: PttBinding } | { kind: 'cancelled' }

export interface PushToTalkBridge {
  setConfig: (config: PttConfig) => void
  capture: () => Promise<PttCapture>
  onChange: (listener: (pressed: boolean) => void) => () => void
  onUnavailable: (listener: () => void) => () => void
}
