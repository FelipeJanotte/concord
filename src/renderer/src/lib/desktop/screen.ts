import type { ScreenShareBridge, ScreenShareEndReason, ScreenSource } from '@shared/screen'
import { command, subscribe } from './ipc'

export function screenBridge(canShareAudio: boolean): ScreenShareBridge {
  return {
    canShareAudio,
    getSources: () => command<ScreenSource[]>('screen-sources'),
    start: (request) => command('screen-start', { request }),
    stop: () => command('screen-stop'),
    onEnded: (listener) => subscribe<ScreenShareEndReason>('screen-ended', listener)
  }
}
