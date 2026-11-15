import { contextBridge, ipcRenderer } from 'electron'
import type { OverlayBridge, OverlayConfig, OverlayRoom, OverlayViewBridge } from '../shared/overlay'
import type { PttBinding, PttConfig, PushToTalkBridge } from '../shared/push-to-talk'
import type { NativeNotification, NotificationsBridge, NotificationTarget } from '../shared/notifications'
import type { ScreenShareBridge, ScreenSource } from '../shared/screen'

const screen: ScreenShareBridge = {
  getSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke('screen-sources'),
  select: (sourceId: string, audio: boolean): Promise<void> => ipcRenderer.invoke('screen-select', sourceId, audio),
  canShareAudio: process.platform === 'win32'
}

/** Overlay (B15), lado da janela principal: manda configuração e a sala; ouve o atalho. */
const overlay: OverlayBridge = {
  setConfig: (config: OverlayConfig): void => ipcRenderer.send('overlay-config', config),
  setRoom: (room: OverlayRoom | null): void => ipcRenderer.send('overlay-room', room),
  onToggled: (listener) => {
    const handler = (_e: unknown, enabled: boolean): void => listener(enabled)
    ipcRenderer.on('overlay-toggled', handler)
    return () => ipcRenderer.removeListener('overlay-toggled', handler)
  }
}

/** Overlay (B15), lado da página do overlay: recebe a sala e a configuração. */
const overlayView: OverlayViewBridge = {
  onUpdate: (listener) => {
    const handler = (_e: unknown, room: OverlayRoom | null, config: OverlayConfig): void => listener(room, config)
    ipcRenderer.on('overlay-update', handler)
    return () => ipcRenderer.removeListener('overlay-update', handler)
  }
}

/** Pressione para falar (B20): configura a escuta e recebe pressionado/solto. */
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

const notifications: NotificationsBridge = {
  show: (notification: NativeNotification): void => ipcRenderer.send('notify', notification),
  setBadge: (count: number, overlay: string | null): void => ipcRenderer.send('badge', count, overlay),
  onClick: (listener) => {
    const handler = (_event: unknown, target: NotificationTarget | null): void => listener(target)
    ipcRenderer.on('notification-click', handler)
    return () => ipcRenderer.removeListener('notification-click', handler)
  }
}

const api = {
  platform: process.platform,
  /** Abre o navegador para o login com Google e devolve o código (fluxo loopback + PKCE). */
  googleSignIn: (clientId: string): Promise<{ code: string; codeVerifier: string; redirectUri: string }> =>
    ipcRenderer.invoke('google-sign-in', clientId),
  /** Compartilhamento de tela: lista telas/janelas e escolhe a fonte (ver src/main/screen-share.ts). */
  screen,
  /** Sobreposição em jogos (ver src/main/overlay.ts). */
  overlay,
  overlayView,
  /** Notificações nativas e selo no ícone (ver src/main/notifications.ts). */
  notifications,
  /** Pressione para falar (ver src/main/push-to-talk.ts). */
  pushToTalk
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore (definido em index.d.ts)
  window.api = api
}
