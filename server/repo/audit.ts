import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auditTargetType, type AuditAction, type AuditEntry, type AuditRecord } from '../../src/shared/types'
import { db } from '../db/client'
import { accounts, auditLog } from '../db/schema'
import { isUuid } from './util'

export type AuditRecordBy = AuditRecord & { actorId: string }

export interface AuditQuery {
  before?: string
  actorId?: string
  action?: AuditAction
  limit: number
}

export async function recordAudit(entry: AuditRecordBy): Promise<void> {
  await db()
    .insert(auditLog)
    .values({
      actorAccountId: entry.actorId,
      action: entry.action,
      targetType: auditTargetType(entry.action),
      targetId: entry.targetId,
      details: entry.details
    })
}

const actor = alias(accounts, 'actor')
const target = alias(accounts, 'target')

function person(row: { accountId: string | null; name: string | null; tag: string | null }): AuditEntry['actor'] {
  return row.accountId && row.name !== null && row.tag !== null ? { accountId: row.accountId, name: row.name, tag: row.tag } : null
}

export async function listAudit(query: AuditQuery): Promise<{ entries: AuditEntry[]; hasMore: boolean }> {
  const conditions: SQL[] = []
  if (query.actorId !== undefined) {
    if (!isUuid(query.actorId)) return { entries: [], hasMore: false }
    conditions.push(eq(auditLog.actorAccountId, query.actorId))
  }
  if (query.action) conditions.push(eq(auditLog.action, query.action))
  if (query.before !== undefined) {
    if (!isUuid(query.before)) return { entries: [], hasMore: false }
    conditions.push(
      sql`(${auditLog.createdAt}, ${auditLog.id}) < (select created_at, id from audit_log where id = ${query.before})`
    )
  }
  const rows = await db()
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetId: auditLog.targetId,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
      actorId: actor.id,
      actorName: actor.name,
      actorTag: actor.tag,
      targetAccountId: target.id,
      targetName: target.name,
      targetTag: target.tag
    })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorAccountId))
    .leftJoin(target, and(eq(auditLog.targetType, 'account'), eq(target.id, auditLog.targetId)))
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(query.limit + 1)
  const entries = rows.slice(0, query.limit).map(
    (r) =>
      ({
        id: r.id,
        action: r.action,
        targetId: r.targetId,
        details: r.details,
        createdAt: r.createdAt.getTime(),
        actor: person({ accountId: r.actorId, name: r.actorName, tag: r.actorTag }),
        target: person({ accountId: r.targetAccountId, name: r.targetName, tag: r.targetTag })
      }) as AuditEntry
  )
  return { entries, hasMore: rows.length > query.limit }
}
