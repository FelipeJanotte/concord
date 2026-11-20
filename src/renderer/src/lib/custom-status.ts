import { useEffect, useState } from 'react'
import type { CustomStatus } from '@shared/types'
import { activeCustomStatus } from '@shared/profile'

export function useActiveCustomStatus(status: CustomStatus | null | undefined): CustomStatus | null {
  const [now, setNow] = useState(() => Date.now())
  const active = activeCustomStatus(status, now)
  const expiresAt = active?.expiresAt
  useEffect(() => {
    if (!expiresAt) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Date.parse(expiresAt) - Date.now()))
    return () => clearTimeout(timer)
  }, [expiresAt])
  return active
}

export function customStatusLabel(status: CustomStatus): string {
  return [status.emoji, status.text].filter(Boolean).join(' ')
}
