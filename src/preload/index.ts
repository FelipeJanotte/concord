import { contextBridge, ipcRenderer } from 'electron'
import { release } from 'os'
import type {
  OverlayBridge,
  OverlayConfig,
  OverlayPosition,
  OverlayRoom,
  OverlayShortcuts,
  OverlayShortcutStatus,
  OverlayViewBridge
} from '../shared/overlay'
import type { ThemeConfig } from '../shared/types/theme'
import type { IdleBridge } from '../shared/idle'
import type { PttBinding, PttConfig, PushToTalkBridge } from '../shared/push-to-talk'
import type { NativeNotification, NotificationsBridge, NotificationTarget } from '../shared/notifications'
import type { OpenAtLogin, StartupBridge } from '../shared/startup'
import type { ThumbarAction, ThumbarBridge, ThumbarButton } from '../shared/thumbar'
import { hasOwnWindowButtons, type WindowControlAction, type WindowControlsBridge } from '../shared/window-controls'
import { supportsTranslucency, type TranslucencyBridge, type TranslucencyRequest } from '../shared/translucency'
import type { UpdaterBridge, UpdateStatus } from '../shared/updater'

const overlay: OverlayBridge = {
  setConfig: (config: OverlayConfig): void => ipcRenderer.send('overlay-config', config),
  setRoom: (room: OverlayRoom | null): void => ipcRenderer.send('overlay-room', room),
  onToggled: (listener) => {
    const handler = (_e: unknown, enabled: boolean): void => listener(enabled)
    ipcRenderer.on('overlay-toggled', handler)
    return () => ipcRenderer.removeListener('overlay-toggled', handler)
  },
  setEditing: (editing: boolean): void => ipcRenderer.send('overlay-edit', editing),
  onEditing: (listener) => {
    const handler = (_e: unknown, editing: boolean): void => listener(editing)
    ipcRenderer.on('overlay-editing', handler)
    return () => ipcRenderer.removeListener('overlay-editing', handler)
  },
  onMoved: (listener) => {
    const handler = (_e: unknown, position: OverlayPosition): void => listener(position)
    ipcRenderer.on('overlay-moved', handler)
    return () => ipcRenderer.removeListener('overlay-moved', handler)
  },
  onResized: (listener) => {
    const handler = (_e: unknown, width: number): void => listener(width)
    ipcRenderer.on('overlay-resized', handler)
    return () => ipcRenderer.removeListener('overlay-resized', handler)
  },
  setShortcuts: (shortcuts: OverlayShortcuts): Promise<OverlayShortcutStatus> => ipcRenderer.invoke('overlay-shortcuts', shortcuts),
  pauseShortcuts: (paused: boolean): void => ipcRenderer.send('overlay-shortcuts-pause', paused),
  setTheme: (theme: ThemeConfig): void => ipcRenderer.send('overlay-theme', theme)
}

const overlayView: OverlayViewBridge = {
  onUpdate: (listener) => {
    const handler = (_e: unknown, room: OverlayRoom | null, config: OverlayConfig, editing: boolean): void =>
      listener(room, config, editing === true)
    ipcRenderer.on('overlay-update', handler)
    return () => ipcRenderer.removeListener('overlay-update', handler)
  },
  finishEditing: (): void => ipcRenderer.send('overlay-edit', false),
  resize: (width: number, done: boolean): void => ipcRenderer.send('overlay-resize', width, done),
  onTheme: (listener) => {
    const handler = (_e: unknown, theme: ThemeConfig): void => listener(theme)
    ipcRenderer.on('overlay-theme', handler)
    return () => ipcRenderer.removeListener('overlay-theme', handler)
  }
}

const pushToTalk: PushToTalkBridge = {
  setConfig: (config: PttConfig): void => ipcRenderer.send('ptt-config', config),
  capture: (): Promise<PttBinding | null> => ipcRenderer.invoke('ptt-capture'),
  onChange: (listener) => {
    const handler = (_e: unknown, pressed: boolean): void => listener(pressed)
    ipcRenderer.on('ptt-change', handler)
    return () => ipcRenderer.removeListener('ptt-change', handler)
  },
  onUnavailable: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on('ptt-unavailable', handler)
    return () => ipcRenderer.removeListener('ptt-unavailable', handler)
  }
}

const idle: IdleBridge = {
  isIdle: (): Promise<boolean> => ipcRenderer.invoke('idle-get'),
  onChange: (listener) => {
    const handler = (_e: unknown, value: boolean): void => listener(value)
    ipcRenderer.on('idle-change', handler)
    return () => ipcRenderer.removeListener('idle-change', handler)
  }
}

const notifications: NotificationsBridge = {
  show: (notification: NativeNotification): void => ipcRenderer.send('notify', notification),
  setBadge: (count: number, overlay: string | null): void => ipcRenderer.send('badge', count, overlay),
  onClick: (listener) => {
    const handler = (_event: unknown, target: NotificationTarget | null): void => listener(target)
    ipcRenderer.on('notification-click', handler)
    return () => ipcRenderer.removeListener('notification-click', handler)
  }
}

const thumbar: ThumbarBridge = {
  setButtons: (buttons: ThumbarButton[]): void => ipcRenderer.send('thumbar-buttons', buttons),
  onClick: (listener) => {
    const handler = (_event: unknown, action: ThumbarAction): void => listener(action)
    ipcRenderer.on('thumbar-click', handler)
    return () => ipcRenderer.removeListener('thumbar-click', handler)
  }
}

const updater: UpdaterBridge = {
  getStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update-get'),
  onStatus: (listener) => {
    const handler = (_e: unknown, status: UpdateStatus): void => listener(status)
    ipcRenderer.on('update-status', handler)
    return () => ipcRenderer.removeListener('update-status', handler)
  },
  check: (): void => ipcRenderer.send('update-check'),
  install: (): void => ipcRenderer.send('update-install')
}

const translucency: TranslucencyBridge = {
  supported: supportsTranslucency(process.platform, release()),
  set: (request: TranslucencyRequest): void => ipcRenderer.send('window-translucency', request)
}

const startup: StartupBridge = {
  get: (): Promise<OpenAtLogin> => ipcRenderer.invoke('startup-get'),
  set: (openAtLogin: boolean): Promise<OpenAtLogin> => ipcRenderer.invoke('startup-set', openAtLogin)
}

const windowControls: WindowControlsBridge = {
  buttons: hasOwnWindowButtons(process.platform),
  run: (action: WindowControlAction): void => ipcRenderer.send('window-control', action),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window-maximized-get'),
  onMaximizedChange: (listener) => {
    const handler = (_e: unknown, maximized: boolean): void => listener(maximized)
    ipcRenderer.on('window-maximized', handler)
    return () => ipcRenderer.removeListener('window-maximized', handler)
  }
}

const api = {
  platform: process.platform,
  googleSignIn: (clientId: string): Promise<{ code: string; codeVerifier: string; redirectUri: string }> =>
    ipcRenderer.invoke('google-sign-in', clientId),
  overlay,
  overlayView,
  notifications,
  thumbar,
  updater,
  pushToTalk,
  idle,
  translucency,
  startup,
  windowControls
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  ;(globalThis as unknown as { api: typeof api }).api = api
}
