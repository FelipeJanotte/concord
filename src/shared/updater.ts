
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

export interface UpdaterBridge {
  getStatus: () => Promise<UpdateStatus>
  onStatus: (listener: (status: UpdateStatus) => void) => () => void
  check: () => void
  install: () => void
}
