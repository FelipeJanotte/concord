import type { PttBinding, PushToTalkBridge } from '@shared/push-to-talk'
import { command, send, subscribe } from './ipc'

export const pushToTalkBridge: PushToTalkBridge = {
  setConfig: (config) => send('ptt-config', { config }),
  capture: () => command<PttBinding | null>('ptt-capture'),
  onChange: (listener) => subscribe<boolean>('ptt-change', listener),
  onUnavailable: (listener) => subscribe<void>('ptt-unavailable', () => listener())
}
