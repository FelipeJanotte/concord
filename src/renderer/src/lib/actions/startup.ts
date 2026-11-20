import type { OpenAtLogin, StartupBridge } from '@shared/startup'
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
    set({ openAtLogin: { supported: false } })
  }
}

async function changeOpenAtLogin(change: (bridge: StartupBridge) => Promise<OpenAtLogin>): Promise<void> {
  const bridge = startupEnv.bridge()
  if (!bridge) return
  try {
    set({ openAtLogin: await change(bridge) })
  } catch {
    notify('Não foi possível mudar o início com o Windows.')
  }
}

export const enableOpenAtLogin = (): Promise<void> => changeOpenAtLogin((bridge) => bridge.enable())

export const disableOpenAtLogin = (): Promise<void> => changeOpenAtLogin((bridge) => bridge.disable())
