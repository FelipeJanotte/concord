import type { IdleBridge } from './idle'
import type { NotificationsBridge } from './notifications'
import type { OverlayBridge, OverlayViewBridge } from './overlay'
import type { PushToTalkBridge } from './push-to-talk'
import type { ScreenShareBridge } from './screen'
import type { StartupBridge } from './startup'
import type { ThumbarBridge } from './thumbar'
import type { TranslucencyBridge } from './translucency'
import type { UpdaterBridge } from './updater'
import type { WindowControlsBridge } from './window-controls'

export interface GoogleSignInResult {
  code: string
  codeVerifier: string
  redirectUri: string
}

export interface DesktopApi {
  platform: string
  googleSignIn: (clientId: string) => Promise<GoogleSignInResult>
  screen: ScreenShareBridge
  overlay: OverlayBridge
  overlayView: OverlayViewBridge
  notifications: NotificationsBridge
  thumbar: ThumbarBridge
  updater: UpdaterBridge
  pushToTalk: PushToTalkBridge
  idle: IdleBridge
  translucency: TranslucencyBridge
  startup: StartupBridge
  windowControls: WindowControlsBridge
}

export interface DesktopEnvironment {
  platform: string
  translucencySupported: boolean
  windowButtons: boolean
  canShareAudio: boolean
}
