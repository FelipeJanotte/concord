import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { release } from 'os'
import { parseTranslucencyRequest, supportsTranslucency, type WindowScheme } from '../shared/translucency'

export interface GlassWindow {
  setBackgroundMaterial?: (material: 'acrylic' | 'none') => void
  setVibrancy?: (type: 'under-window' | null) => void
  setBackgroundColor: (color: string) => void
}

export interface NativeScheme {
  themeSource: 'system' | WindowScheme
}

export const OPAQUE_WINDOW_COLOR = '#1e1f22'
const TRANSPARENT_WINDOW_COLOR = '#00000000'

export function applyTranslucency(win: GlassWindow, native: NativeScheme, raw: unknown, platform: string, osRelease: string): boolean {
  const request = parseTranslucencyRequest(raw)
  if (!request) return false
  native.themeSource = request.scheme
  if (!supportsTranslucency(platform, osRelease)) return false
  if (platform === 'darwin') win.setVibrancy?.(request.glass ? 'under-window' : null)
  else win.setBackgroundMaterial?.(request.glass ? 'acrylic' : 'none')
  win.setBackgroundColor(request.glass ? TRANSPARENT_WINDOW_COLOR : OPAQUE_WINDOW_COLOR)
  return true
}

export function setupTranslucency(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on('window-translucency', (event, request: unknown) => {
    const win = getMainWindow()
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return
    applyTranslucency(win, nativeTheme, request, process.platform, release())
  })
}
