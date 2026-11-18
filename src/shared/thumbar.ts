export const THUMBAR_ACTIONS = ['mute', 'deafen', 'leave'] as const
export type ThumbarAction = (typeof THUMBAR_ACTIONS)[number]

export const THUMBAR_TOOLTIP_MAX = 64
export const THUMBAR_ICON_SIZE = 32

export interface ThumbarButton {
  action: ThumbarAction
  tooltip: string
  icon: string
}

export interface ThumbarBridge {
  setButtons: (buttons: ThumbarButton[]) => void
  onClick: (listener: (action: ThumbarAction) => void) => () => void
}
