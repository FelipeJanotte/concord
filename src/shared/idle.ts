export const IDLE_AFTER_SECONDS = 600
export const IDLE_CHECK_MS = 5000

export function isIdle(idleSeconds: number): boolean {
  return idleSeconds >= IDLE_AFTER_SECONDS
}

export interface IdleBridge {
  isIdle: () => Promise<boolean>
  onChange: (listener: (idle: boolean) => void) => () => void
}
