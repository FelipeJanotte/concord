export interface PipRect {
  x: number
  y: number
  width: number
}

export interface Viewport {
  width: number
  height: number
}

export const PIP_MIN_WIDTH = 240
export const PIP_HEADER = 36
const PIP_DEFAULT_WIDTH = 320
const PIP_MARGIN = 16
const STORAGE_KEY = 'concord:screen-pip'

export function pipHeight(width: number): number {
  return Math.round((width * 9) / 16) + PIP_HEADER
}

function maxWidth(viewport: Viewport): number {
  const byHeight = Math.floor(((viewport.height - PIP_HEADER) * 16) / 9)
  return Math.max(PIP_MIN_WIDTH, Math.min(viewport.width, byHeight))
}

export function clampPip(rect: PipRect, viewport: Viewport): PipRect {
  const width = Math.round(Math.min(maxWidth(viewport), Math.max(PIP_MIN_WIDTH, rect.width)))
  const x = Math.round(Math.min(viewport.width - width, Math.max(0, rect.x)))
  const y = Math.round(Math.min(viewport.height - pipHeight(width), Math.max(0, rect.y)))
  return { x: Math.max(0, x), y: Math.max(0, y), width }
}

export function defaultPip(viewport: Viewport): PipRect {
  const width = PIP_DEFAULT_WIDTH
  return clampPip({ x: viewport.width - width - PIP_MARGIN, y: viewport.height - pipHeight(width) - PIP_MARGIN, width }, viewport)
}

export function movePip(rect: PipRect, dx: number, dy: number, viewport: Viewport): PipRect {
  return clampPip({ ...rect, x: rect.x + dx, y: rect.y + dy }, viewport)
}

export function resizePip(rect: PipRect, dx: number, viewport: Viewport): PipRect {
  return clampPip({ ...rect, width: rect.width + dx }, viewport)
}

export function loadPip(): PipRect | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const { x, y, width } = value as Record<string, unknown>
    return typeof x === 'number' && typeof y === 'number' && typeof width === 'number' ? { x, y, width } : null
  } catch {
    return null
  }
}

export function savePip(rect: PipRect): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rect))
  } catch {
    return
  }
}
