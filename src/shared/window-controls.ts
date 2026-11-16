export const WINDOW_CONTROL_ACTIONS = ['minimize', 'maximize', 'close'] as const

export type WindowControlAction = (typeof WINDOW_CONTROL_ACTIONS)[number]

export function isWindowControlAction(raw: unknown): raw is WindowControlAction {
  return (WINDOW_CONTROL_ACTIONS as readonly unknown[]).includes(raw)
}

export function hasOwnWindowButtons(platform: string): boolean {
  return platform !== 'darwin'
}

export interface WindowControlsBridge {
  buttons: boolean
  run: (action: WindowControlAction) => void
  isMaximized: () => Promise<boolean>
  onMaximizedChange: (listener: (maximized: boolean) => void) => () => void
}
