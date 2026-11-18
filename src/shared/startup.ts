export type OpenAtLogin = boolean | null

export interface StartupBridge {
  get: () => Promise<OpenAtLogin>
  set: (openAtLogin: boolean) => Promise<OpenAtLogin>
}
