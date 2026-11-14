/**
 * Conversas privadas (v3, A7): abrir e listar. Mensagens, anexos, histórico e "digitando"
 * passam pelos módulos de sempre (`messages`, `uploads`); o que muda é o acesso
 * (`server/access.ts`: num DM só os dois membros veem, e bloqueio impede enviar).
 */
import type { DmEntry, DmOpenResult } from '../../src/shared/types'
import { rememberDm } from '../access'
import { guard, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { listDms, findDm, openDm } from '../repo/dms'
import { blockedBetween, findFriendAccount, getRelation } from '../repo/friends'
import { isUuid } from '../repo/util'
import { emitToAccount } from './friends'

const fail = (error: string): DmOpenResult => ({ ok: false, error })

export const dmsModule: ServerModule = {
  socket(io, socket) {
    socket.on('dm:list', (ack) => {
      if (typeof ack !== 'function') return
      void guard('dm:list', async () => {
        const me = socket.data.user?.accountId
        ack(me ? await listDms(me) : [])
      })
    })

    socket.on('dm:open', (accountId, ack) => {
      if (typeof ack !== 'function') return
      void guard('dm:open', async () => {
        const me = socket.data.user?.accountId
        if (!me) return ack(fail('Não autenticado'))
        if (!isUuid(accountId)) return ack(fail('Conta inválida'))
        if (accountId === me) return ack(fail('Você não pode conversar consigo mesmo'))
        const limited = limiters.dm.take(me)
        if (!limited.ok) return ack(fail(`Muitas conversas abertas seguidas. ${retryText(limited.retryAfterMs)}`))

        const other = await findFriendAccount(accountId)
        if (!other) return ack(fail('Conta não encontrada'))
        // bloqueio (de qualquer lado) fecha a conversa; a mensagem não diz quem bloqueou
        if (await blockedBetween(me, accountId)) return ack(fail('Não foi possível abrir a conversa'))
        // conversa nova só entre amigos; uma que já existe continua abrindo (o histórico não some)
        const existing = await findDm(me, accountId)
        if (!existing && (await getRelation(me, accountId))?.status !== 'friend') {
          return ack(fail('Vocês precisam ser amigos para conversar'))
        }

        const { channel, created } = existing ? { channel: existing, created: false } : await openDm(me, accountId)
        rememberDm(channel.id, me, accountId)
        const dm: DmEntry = { channel, other }
        if (created) {
          const self = await findFriendAccount(me)
          // a outra pessoa (todas as janelas) e as minhas outras janelas ficam sabendo
          if (self) emitToAccount(io, accountId, 'dm:created', { channel, other: self })
          for (const s of io.sockets.sockets.values()) {
            if (s.id !== socket.id && s.data.user?.accountId === me) s.emit('dm:created', dm)
          }
        }
        ack({ ok: true, dm })
      })
    })
  }
}
