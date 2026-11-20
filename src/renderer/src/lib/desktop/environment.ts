import type { DesktopEnvironment } from '@shared/desktop-api'

export function readDesktopEnvironment(): DesktopEnvironment {
  const injected = (window as unknown as { __CONCORD_DESKTOP__?: DesktopEnvironment }).__CONCORD_DESKTOP__
  if (!injected) throw new Error('window.__CONCORD_DESKTOP__ não foi injetado pelo Rust')
  return injected
}
