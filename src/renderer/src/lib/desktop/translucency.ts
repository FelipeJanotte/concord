import type { TranslucencyBridge } from '@shared/translucency'
import { send } from './ipc'

export function translucencyBridge(supported: boolean): TranslucencyBridge {
  return { supported, set: (request) => send('window-translucency', { request }) }
}
