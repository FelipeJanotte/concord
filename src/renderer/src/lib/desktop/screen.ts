import type { ScreenShareBridge, ScreenShareEndReason, ScreenSource } from '@shared/screen'
import type { DesktopEnvironment } from '@shared/desktop-api'
import { command, subscribe } from './ipc'

export function screenBridge(environment: Pick<DesktopEnvironment, 'canShareAudio'>): ScreenShareBridge {
  return {
    canShareAudio: environment.canShareAudio,
    getSources: () => command<ScreenSource[]>('screen-sources'),
    start: (request) => command('screen-start', { request }),
    stop: () => command('screen-stop'),
    preview: () => command<string>('screen-preview'),
    onEnded: (listener) => subscribe<ScreenShareEndReason>('screen-ended', listener)
  }
}
