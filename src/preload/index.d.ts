import type { OverlayBridge, OverlayViewBridge } from '../shared/overlay'
import type { NotificationsBridge } from '../shared/notifications'
import type { ScreenShareBridge } from '../shared/screen'
import type { UpdaterBridge } from '../shared/updater'

declare global {
  interface Window {
    api: {
      platform: string
      googleSignIn: (clientId: string) => Promise<{ code: string; codeVerifier: string; redirectUri: string }>
      screen: ScreenShareBridge
      overlay: OverlayBridge
      overlayView: OverlayViewBridge
      notifications: NotificationsBridge
      updater: UpdaterBridge
    }
  }
}

export {}
