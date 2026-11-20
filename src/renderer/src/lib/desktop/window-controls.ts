import type { WindowControlsBridge } from '@shared/window-controls'
import type { DesktopEnvironment } from '@shared/desktop-api'
import { command, send, subscribe } from './ipc'

export function windowControlsBridge(environment: Pick<DesktopEnvironment, 'windowButtons'>): WindowControlsBridge {
  return {
    buttons: environment.windowButtons,
    run: (action) => send('window-control', { action }),
    isMaximized: () => command<boolean>('window-maximized-get'),
    onMaximizedChange: (listener) => subscribe<boolean>('window-maximized', listener)
  }
}
