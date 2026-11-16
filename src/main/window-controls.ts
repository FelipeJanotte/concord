import { BrowserWindow, ipcMain, type BrowserWindowConstructorOptions } from 'electron'
import { isWindowControlAction } from '../shared/window-controls'

export interface ControllableWindow {
  minimize: () => void
  maximize: () => void
  unmaximize: () => void
  close: () => void
  isMaximized: () => boolean
}

export function titleBarOptions(platform: string): Pick<BrowserWindowConstructorOptions, 'titleBarStyle' | 'trafficLightPosition'> {
  if (platform === 'darwin') return { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 10 } }
  return { titleBarStyle: 'hidden' }
}

export function runWindowControl(win: ControllableWindow, raw: unknown): void {
  if (!isWindowControlAction(raw)) return
  if (raw === 'minimize') win.minimize()
  else if (raw === 'close') win.close()
  else if (win.isMaximized()) win.unmaximize()
  else win.maximize()
}

export function watchMaximized(win: BrowserWindow): void {
  const send = (): void => {
    if (!win.isDestroyed()) win.webContents.send('window-maximized', win.isMaximized())
  }
  win.on('maximize', send)
  win.on('unmaximize', send)
}

export function setupWindowControls(getMainWindow: () => BrowserWindow | null): void {
  const mainWindowOf = (sender: Electron.WebContents): BrowserWindow | null => {
    const win = getMainWindow()
    return win && !win.isDestroyed() && sender === win.webContents ? win : null
  }
  ipcMain.on('window-control', (event, action: unknown) => {
    const win = mainWindowOf(event.sender)
    if (win) runWindowControl(win, action)
  })
  ipcMain.handle('window-maximized-get', (event) => mainWindowOf(event.sender)?.isMaximized() ?? false)
}
