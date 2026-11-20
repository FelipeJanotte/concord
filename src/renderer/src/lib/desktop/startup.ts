import type { OpenAtLogin, StartupBridge } from '@shared/startup'
import { command } from './ipc'

function openAtLogin(raw: boolean | null): OpenAtLogin {
  return raw === null ? { supported: false } : { supported: true, enabled: raw }
}

async function change(enabled: boolean): Promise<OpenAtLogin> {
  return openAtLogin(await command<boolean | null>('startup-set', { openAtLogin: enabled }))
}

export const startupBridge: StartupBridge = {
  get: async () => openAtLogin(await command<boolean | null>('startup-get')),
  enable: () => change(true),
  disable: () => change(false)
}
