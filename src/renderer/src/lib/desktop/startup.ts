import type { OpenAtLogin, StartupBridge } from '@shared/startup'
import { command } from './ipc'

export const startupBridge: StartupBridge = {
  get: () => command<OpenAtLogin>('startup-get'),
  set: (openAtLogin) => command<OpenAtLogin>('startup-set', { openAtLogin })
}
