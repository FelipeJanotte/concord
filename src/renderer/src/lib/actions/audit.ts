import type { AuditEntry, AuditFilter } from '@shared/types'
import { requireSocket } from '../core'

export async function loadAudit(filter: AuditFilter): Promise<{ entries: AuditEntry[]; hasMore: boolean }> {
  const res = await requireSocket().emitWithAck('audit:list', filter)
  if (!res.ok) throw new Error(res.error)
  return { entries: res.entries, hasMore: res.hasMore }
}
