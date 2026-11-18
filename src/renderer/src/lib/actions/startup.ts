import type { StartupBridge } from '@shared/startup'
import { notify, set } from '../core'

export const startupEnv = {
  bridge: (): StartupBridge | null => (typeof window !== 'undefined' ? (window.api?.startup ?? null) : null)
}

export async function loadStartup(): Promise<void> {
  const bridge = startupEnv.bridge()
  if (!bridge) return
  try {
    set({ openAtLogin: await bridge.get() })
  } catch {
    set({ openAtLogin: null })
  }
}

export async function setOpenAtLogin(openAtLogin: boolean): Promise<void> {
  const bridge = startupEnv.bridge()
  if (!bridge) return
  try {
    set({ openAtLogin: await bridge.set(openAtLogin) })
  } catch {
    notify('Não foi possível mudar o início com o Windows.')
  }
}
