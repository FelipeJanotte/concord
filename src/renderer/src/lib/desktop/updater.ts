import type { UpdateStatus, UpdaterBridge } from '@shared/updater'
import { command, send, subscribe } from './ipc'

export const updaterBridge: UpdaterBridge = {
  getStatus: () => command<UpdateStatus>('update-get'),
  onStatus: (listener) => subscribe<UpdateStatus>('update-status', listener),
  check: () => send('update-check'),
  install: () => send('update-install')
}
