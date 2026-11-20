import type { OpenAtLogin } from '@shared/startup'

export interface StartupState {
  openAtLogin: OpenAtLogin
}

export const startupInitial: StartupState = {
  openAtLogin: { supported: false }
}
