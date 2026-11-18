import { app, ipcMain } from 'electron'
import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { OpenAtLogin } from '../shared/startup'

export interface LoginItems {
  get: () => boolean
  set: (openAtLogin: boolean) => void
}

export interface DefaultMarker {
  applied: () => boolean
  markApplied: () => void
}

export interface StartupDeps {
  supported: boolean
  loginItems: LoginItems
  marker: DefaultMarker
}

export function supportsOpenAtLogin(platform: string, isPackaged: boolean): boolean {
  return platform === 'win32' && isPackaged
}

export function createStartupController({ supported, loginItems, marker }: StartupDeps) {
  const get = (): OpenAtLogin => (supported ? loginItems.get() : null)

  return {
    applyDefault(): void {
      if (!supported || marker.applied()) return
      loginItems.set(true)
      marker.markApplied()
    },
    get,
    set(openAtLogin: unknown): OpenAtLogin {
      if (supported && typeof openAtLogin === 'boolean') loginItems.set(openAtLogin)
      return get()
    }
  }
}

export function fileMarker(path: string): DefaultMarker {
  return {
    applied: () => existsSync(path),
    markApplied: () => writeFileSync(path, '')
  }
}

export function setupStartup(): void {
  const controller = createStartupController({
    supported: supportsOpenAtLogin(process.platform, app.isPackaged),
    loginItems: {
      get: () => app.getLoginItemSettings().executableWillLaunchAtLogin,
      set: (openAtLogin) => app.setLoginItemSettings({ openAtLogin })
    },
    marker: fileMarker(join(app.getPath('userData'), 'startup-default-applied'))
  })
  try {
    controller.applyDefault()
  } catch (err) {
    console.warn('[iniciar com o Windows] padrão não aplicado:', err)
  }
  ipcMain.handle('startup-get', () => controller.get())
  ipcMain.handle('startup-set', (_event, openAtLogin: unknown) => controller.set(openAtLogin))
}
