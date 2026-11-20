import type { PttBinding, PushToTalkBridge } from '@shared/push-to-talk'
import { command, send, subscribe } from './ipc'

export const pushToTalkBridge: PushToTalkBridge = {
  setConfig: (config) => send('ptt-config', { config }),
  capture: async () => {
    const binding = await command<PttBinding | null>('ptt-capture')
    return binding === null ? { kind: 'cancelled' } : { kind: 'chosen', binding }
  },
  onChange: (listener) => subscribe<boolean>('ptt-change', listener),
  onUnavailable: (listener) => subscribe<void>('ptt-unavailable', () => listener())
}
