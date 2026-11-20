import type { IdleBridge } from '@shared/idle'
import { command, subscribe } from './ipc'

export const idleBridge: IdleBridge = {
  isIdle: () => command<boolean>('idle-get'),
  onChange: (listener) => subscribe<boolean>('idle-change', listener)
}
