export type SidePanel = { storageKey: string; initial: number; min: number; max: number }

export const SIDE_PANELS = {
  navigation: { storageKey: 'concord:side-width:navigation', initial: 240, min: 200, max: 400 },
  members: { storageKey: 'concord:side-width:members', initial: 240, min: 200, max: 400 },
  voiceChat: { storageKey: 'concord:side-width:voice-chat', initial: 360, min: 280, max: 640 }
} satisfies Record<string, SidePanel>

export function clampWidth(width: number, panel: SidePanel): number {
  return Math.round(Math.min(panel.max, Math.max(panel.min, width)))
}

export function loadSideWidth(panel: SidePanel): number {
  try {
    const stored = Number(localStorage.getItem(panel.storageKey))
    return stored ? clampWidth(stored, panel) : panel.initial
  } catch {
    return panel.initial
  }
}

export function saveSideWidth(panel: SidePanel, width: number): void {
  try {
    localStorage.setItem(panel.storageKey, String(width))
  } catch {
    return
  }
}
