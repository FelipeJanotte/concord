import { notify } from '@/lib/client'

export const reportError =
  (fallback: string) =>
  (err: unknown): void =>
    notify(err instanceof Error ? err.message : fallback)
