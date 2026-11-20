export type OpenAtLogin = { supported: false } | { supported: true; enabled: boolean }

export interface StartupBridge {
  get: () => Promise<OpenAtLogin>
  enable: () => Promise<OpenAtLogin>
  disable: () => Promise<OpenAtLogin>
}
