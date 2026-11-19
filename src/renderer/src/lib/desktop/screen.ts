import type { ScreenShareBridge, ScreenSource } from '@shared/screen'
import { command } from './ipc'

export function screenBridge(canShareAudio: boolean): ScreenShareBridge {
  return {
    canShareAudio,
    getSources: () => command<ScreenSource[]>('screen-sources'),
    select: (sourceId, audio) => command('screen-select', { sourceId, audio })
  }
}
