import type { NotificationsBridge } from '../shared/notifications'
import type { ScreenShareBridge } from '../shared/screen'

declare global {
  interface Window {
    api: {
      platform: string
      googleSignIn: (clientId: string) => Promise<{ code: string; codeVerifier: string; redirectUri: string }>
      screen: ScreenShareBridge
      notifications: NotificationsBridge
    }
  }
}

export {}
