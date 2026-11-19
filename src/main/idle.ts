import { ipcMain, powerMonitor, type BrowserWindow } from 'electron'
import { IDLE_CHECK_MS, isIdle } from '../shared/idle'

export interface IdleWatcherDeps {
  idleSeconds: () => number
  onChange: (idle: boolean) => void
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

export interface IdleWatcher {
  isIdle: () => boolean
  destroy: () => void
}

export function createIdleWatcher(deps: IdleWatcherDeps): IdleWatcher {
  let idle = false
  const timer = deps.setInterval(() => {
    const now = isIdle(deps.idleSeconds())
    if (now === idle) return
    idle = now
    deps.onChange(now)
  }, IDLE_CHECK_MS)
  return { isIdle: () => idle, destroy: () => deps.clearInterval(timer) }
}

export function setupIdle(getWindow: () => BrowserWindow | null): IdleWatcher {
  const watcher = createIdleWatcher({
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    onChange: (idle) => getWindow()?.webContents.send('idle-change', idle),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>)
  })
  ipcMain.handle('idle-get', () => watcher.isIdle())
  return watcher
}
