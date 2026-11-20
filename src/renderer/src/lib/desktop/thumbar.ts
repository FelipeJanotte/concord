import type { ThumbarAction, ThumbarBridge } from '@shared/thumbar'
import { send, subscribe } from './ipc'

export const thumbarBridge: ThumbarBridge = {
  setButtons: (buttons) => send('thumbar-buttons', { buttons }),
  onClick: (listener) => subscribe<ThumbarAction>('thumbar-click', listener)
}
