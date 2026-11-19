import type { PresenceStatus } from '@shared/types'
import { useApp } from '@/store'

export type DotStatus = PresenceStatus | 'offline'

export const STATUS_LABEL: Record<DotStatus, string> = {
  online: 'Online',
  idle: 'Ausente',
  dnd: 'Não perturbe',
  offline: 'Offline'
}

export function usePresence(accountId: string, online = true): DotStatus {
  return useApp((s) => (online ? (s.statuses[accountId] ?? 'online') : 'offline'))
}
