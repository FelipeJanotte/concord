import type { WindowControlsBridge } from '@shared/window-controls'
import { command, send, subscribe } from './ipc'

export function windowControlsBridge(buttons: boolean): WindowControlsBridge {
  return {
    buttons,
    run: (action) => send('window-control', { action }),
    isMaximized: () => command<boolean>('window-maximized-get'),
    onMaximizedChange: (listener) => subscribe<boolean>('window-maximized', listener)
  }
}
