import { beforeEach, describe, expect, it } from 'vitest'
import type { AuditEntry } from '@shared/types'
import { loadAudit } from '@/lib/actions/audit'
import { setSocket } from '@/lib/core'
import { FakeSocket } from '@/test/fake-socket'

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
})

describe('loadAudit', () => {
  it('manda o filtro e devolve a página', async () => {
    const entry: AuditEntry = {
      id: 'e1',
      action: 'kick',
      targetId: 'ana',
      details: {},
      actor: { accountId: 'dona', name: 'Dona', tag: 'dona' },
      target: { accountId: 'ana', name: 'Ana', tag: 'ana' },
      createdAt: 1
    }
    socket.replyTo('audit:list', () => ({ ok: true, entries: [entry], hasMore: true }))
    expect(await loadAudit({ action: 'kick', before: 'e0' })).toEqual({ entries: [entry], hasMore: true })
    expect(socket.sent('audit:list')[0][0]).toEqual({ action: 'kick', before: 'e0' })
  })

  it('erro do servidor vira exceção', async () => {
    socket.replyTo('audit:list', () => ({ ok: false, error: 'Você não pode ver o registro de auditoria' }))
    await expect(loadAudit({})).rejects.toThrow('Você não pode ver o registro de auditoria')
  })
})
