import type { WindowControlAction, WindowControlsBridge } from '@shared/window-controls'
import { set } from '../core'

export const windowEnv = {
  bridge: (): WindowControlsBridge | null => (typeof window !== 'undefined' ? (window.api?.windowControls ?? null) : null)
}

export function startWindowControls(): () => void {
  const bridge = windowEnv.bridge()
  if (!bridge) return () => {}
  const off = bridge.onMaximizedChange((windowMaximized) => set({ windowMaximized }))
  void bridge
    .isMaximized()
    .then((windowMaximized) => set({ windowMaximized }))
    .catch(() => {})
  return off
}

export function runWindowControl(action: WindowControlAction): void {
  windowEnv.bridge()?.run(action)
}
