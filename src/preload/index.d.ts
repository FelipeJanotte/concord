import type { OverlayBridge, OverlayViewBridge } from '../shared/overlay'
import type { PushToTalkBridge } from '../shared/push-to-talk'
import type { NotificationsBridge } from '../shared/notifications'
import type { ScreenShareBridge } from '../shared/screen'

declare global {
  interface Window {
    api: {
      platform: string
      googleSignIn: (clientId: string) => Promise<{ code: string; codeVerifier: string; redirectUri: string }>
      screen: ScreenShareBridge
      overlay: OverlayBridge
      overlayView: OverlayViewBridge
      notifications: NotificationsBridge
      pushToTalk: PushToTalkBridge
    }
  }
}

export {}
