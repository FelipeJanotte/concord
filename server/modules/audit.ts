import { AUDIT_PAGE_SIZE, hasFullAccess, isAuditAction, type AuditFilter } from '../../src/shared/types'
import { currentAccess } from '../access'
import { guard, type ServerModule } from '../context'
import { listAudit } from '../repo/audit'

const optionalText = (value: unknown): boolean => value === undefined || typeof value === 'string'

function validFilter(raw: unknown): AuditFilter | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { before, actorId, action } = raw as Record<string, unknown>
  if (!optionalText(before) || !optionalText(actorId)) return null
  if (action !== undefined && !isAuditAction(action)) return null
  return { before: before as string | undefined, actorId: actorId as string | undefined, action }
}

export const auditModule: ServerModule = {
  socket(_io, socket) {
    socket.on('audit:list', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('audit:list', async () => {
        const user = socket.data.user
        if (!user || !hasFullAccess(await currentAccess(), user.accountId)) {
          return ack({ ok: false, error: 'Você não pode ver o registro de auditoria' })
        }
        const filter = validFilter(payload)
        if (!filter) return ack({ ok: false, error: 'Filtro inválido' })
        ack({ ok: true, ...(await listAudit({ ...filter, limit: AUDIT_PAGE_SIZE })) })
      })
    })
  }
}
