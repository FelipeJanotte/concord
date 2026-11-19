import type { DesktopApi, DesktopEnvironment } from '@shared/desktop-api'
import { googleSignIn } from './google'
import { idleBridge } from './idle'
import { notificationsBridge } from './notifications'
import { overlayBridge, overlayViewBridge } from './overlay'
import { pushToTalkBridge } from './push-to-talk'
import { screenBridge } from './screen'
import { startupBridge } from './startup'
import { thumbarBridge } from './thumbar'
import { translucencyBridge } from './translucency'
import { updaterBridge } from './updater'
import { windowControlsBridge } from './window-controls'

export function buildDesktopApi(environment: DesktopEnvironment): DesktopApi {
  return {
    platform: environment.platform,
    googleSignIn,
    screen: screenBridge(environment.canShareAudio),
    overlay: overlayBridge,
    overlayView: overlayViewBridge,
    notifications: notificationsBridge,
    thumbar: thumbarBridge,
    updater: updaterBridge,
    pushToTalk: pushToTalkBridge,
    idle: idleBridge,
    translucency: translucencyBridge(environment.translucencySupported),
    startup: startupBridge,
    windowControls: windowControlsBridge(environment.windowButtons)
  }
}
