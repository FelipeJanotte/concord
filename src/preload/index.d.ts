import type { OverlayBridge, OverlayViewBridge } from '../shared/overlay'
import type { PushToTalkBridge } from '../shared/push-to-talk'
import type { NotificationsBridge } from '../shared/notifications'
import type { ScreenShareBridge } from '../shared/screen'
import type { StartupBridge } from '../shared/startup'
import type { TranslucencyBridge } from '../shared/translucency'
import type { UpdaterBridge } from '../shared/updater'
import type { WindowControlsBridge } from '../shared/window-controls'

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
      pushToTalk: PushToTalkBridge
      translucency: TranslucencyBridge
      startup: StartupBridge
      windowControls: WindowControlsBridge
    }
  }
}

export {}
