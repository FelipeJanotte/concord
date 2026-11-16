export const WINDOWS_ACRYLIC_BUILD = 22621

export function supportsTranslucency(platform: string, release: string): boolean {
  if (platform === 'darwin') return true
  if (platform !== 'win32') return false
  const build = Number(release.split('.')[2])
  return Number.isFinite(build) && build >= WINDOWS_ACRYLIC_BUILD
}

export type WindowScheme = 'dark' | 'light'

export interface TranslucencyRequest {
  glass: boolean
  scheme: WindowScheme
}

export function parseTranslucencyRequest(raw: unknown): TranslucencyRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { glass, scheme } = raw as Record<string, unknown>
  if (typeof glass !== 'boolean' || (scheme !== 'dark' && scheme !== 'light')) return null
  return { glass, scheme }
}

export interface TranslucencyBridge {
  supported: boolean
  set: (request: TranslucencyRequest) => void
}
