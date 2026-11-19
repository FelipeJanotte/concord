import { getCurrentWindow } from '@tauri-apps/api/window'
import { buildDesktopApi } from './api'
import { readDesktopEnvironment } from './environment'
import { send } from './ipc'

const MAIN_WINDOW_LABEL = 'main'

function showMainWindowAfterFirstPaint(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => send('show-main-window')))
}

export function installDesktopApi(): void {
  if (!('__TAURI_INTERNALS__' in window)) return
  window.api = buildDesktopApi(readDesktopEnvironment())
  if (getCurrentWindow().label === MAIN_WINDOW_LABEL) showMainWindowAfterFirstPaint()
}
