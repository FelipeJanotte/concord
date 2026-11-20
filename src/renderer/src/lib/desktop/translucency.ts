import type { TranslucencyBridge } from '@shared/translucency'
import type { DesktopEnvironment } from '@shared/desktop-api'
import { send } from './ipc'

export function translucencyBridge(environment: Pick<DesktopEnvironment, 'translucencySupported'>): TranslucencyBridge {
  return { supported: environment.translucencySupported, set: (request) => send('window-translucency', { request }) }
}
