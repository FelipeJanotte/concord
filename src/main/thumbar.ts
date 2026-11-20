import { ipcMain, nativeImage, type BrowserWindow } from 'electron'
import { THUMBAR_ACTIONS, THUMBAR_ICON_SIZE, THUMBAR_TOOLTIP_MAX, type ThumbarAction, type ThumbarButton } from '../shared/thumbar'

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'
const ICON_SCALE_FACTOR = THUMBAR_ICON_SIZE / 16

function isThumbarAction(value: unknown): value is ThumbarAction {
  return THUMBAR_ACTIONS.includes(value as ThumbarAction)
}

function cleanButton(raw: unknown): ThumbarButton | null {
  const b = raw as Partial<Record<keyof ThumbarButton, unknown>> | null
  if (!b || !isThumbarAction(b.action) || typeof b.tooltip !== 'string' || !b.tooltip.trim()) return null
  if (typeof b.icon !== 'string' || !b.icon.startsWith(PNG_DATA_URL_PREFIX)) return null
  return { action: b.action, tooltip: b.tooltip.slice(0, THUMBAR_TOOLTIP_MAX), icon: b.icon }
}

export function cleanThumbarButtons(raw: unknown): ThumbarButton[] {
  if (!Array.isArray(raw)) return []
  const buttons: ThumbarButton[] = []
  for (const item of raw) {
    const button = cleanButton(item)
    if (button && !buttons.some((b) => b.action === button.action)) buttons.push(button)
  }
  return buttons
}

function iconFrom(dataUrl: string): Electron.NativeImage {
  const bytes = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64')
  return nativeImage.createFromBuffer(bytes, { scaleFactor: ICON_SCALE_FACTOR })
}

function applyButtons(win: BrowserWindow, buttons: ThumbarButton[]): void {
  win.setThumbarButtons(
    buttons.map((button) => ({
      tooltip: button.tooltip,
      icon: iconFrom(button.icon),
      click: () => win.webContents.send('thumbar-click', button.action)
    }))
  )
}

export function setupThumbar(getWindow: () => BrowserWindow | null): void {
  let waitingForShow: ThumbarButton[] | null = null
  ipcMain.on('thumbar-buttons', (_event, raw: unknown) => {
    const win = getWindow()
    if (process.platform !== 'win32' || !win) return
    const buttons = cleanThumbarButtons(raw)
    if (win.isVisible()) return applyButtons(win, buttons)
    if (!waitingForShow) {
      win.once('show', () => {
        if (waitingForShow) applyButtons(win, waitingForShow)
        waitingForShow = null
      })
    }
    waitingForShow = buttons
  })
}
