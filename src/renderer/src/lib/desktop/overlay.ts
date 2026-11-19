import type { OverlayBridge, OverlayPosition, OverlayShortcutStatus, OverlayViewBridge } from '@shared/overlay'
import { command, send, subscribe } from './ipc'

export const overlayBridge: OverlayBridge = {
  setConfig: (config) => send('overlay-config', { config }),
  setRoom: (room) => send('overlay-room', { room }),
  onToggled: (listener) => subscribe<boolean>('overlay-toggled', listener),
  setEditing: (editing) => send('overlay-edit', { editing }),
  onEditing: (listener) => subscribe<boolean>('overlay-editing', listener),
  onMoved: (listener) => subscribe<OverlayPosition>('overlay-moved', listener),
  onResized: (listener) => subscribe<number>('overlay-resized', listener),
  setShortcuts: (shortcuts) => command<OverlayShortcutStatus>('overlay-shortcuts', { shortcuts }),
  pauseShortcuts: (paused) => send('overlay-shortcuts-pause', { paused }),
  setTheme: (theme) => send('overlay-theme', { theme })
}

type OverlayUpdate = Parameters<Parameters<OverlayViewBridge['onUpdate']>[0]>

export const overlayViewBridge: OverlayViewBridge = {
  onUpdate: (listener) =>
    subscribe<{ room: OverlayUpdate[0]; config: OverlayUpdate[1]; editing: boolean }>('overlay-update', (update) =>
      listener(update.room, update.config, update.editing === true)
    ),
  finishEditing: () => send('overlay-edit', { editing: false }),
  resize: (width, done) => send('overlay-resize', { width, done }),
  onTheme: (listener) => subscribe('overlay-theme', listener)
}
