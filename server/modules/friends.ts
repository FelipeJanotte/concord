/**
 * Amizades (v3, contrato em src/shared/types/friends.ts).
 * Toda mudança avisa as conexões das DUAS contas (`friend:updated` ou `friend:removed`).
 * Online/offline vai só para amigos (`friend:presence`, chamado pela presença).
 */
import {
  FRIEND_PENDING_MAX,
  parseFriendTarget,
  type FriendEntry,
  type FriendResult,
  type ServerToClientEvents
} from '../../src/shared/types'
import { guard, users, type AppServer, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import {
  block,
  countOutgoing,
  deletePair,
  findAccountByTag,
  friendIds,
  getRelation,
  getRelationWithAccount,
  listRelations,
  makeFriends,
  sendRequest,
  unblock
} from '../repo/friends'
import { findDm } from '../repo/dms'
import { isUuid } from '../repo/util'
import { leaveDmVoice } from './voice'

/** A conta tem alguma conexão aberta (já deu `hello`)? */
export function isOnline(accountId: string): boolean {
  for (const u of users.values()) if (u.accountId === accountId) return true
  return false
}

type Event = keyof ServerToClientEvents

/** Emite para todas as conexões de uma conta. */
export function emitToAccount<E extends Event>(io: AppServer, accountId: string, event: E, payload: Parameters<ServerToClientEvents[E]>[0]): void {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.user?.accountId === accountId) (socket.emit as (ev: string, data: unknown) => boolean)(event, payload)
  }
}

/** Como `me` vê `other` agora (null = sem relação). Online só para amigos. */
async function entryFor(me: string, other: string): Promise<FriendEntry | null> {
  const rel = await getRelationWithAccount(me, other)
  if (!rel) return null
  return { account: rel.account, status: rel.status, since: rel.since, online: rel.status === 'friend' && isOnline(other) }
}

/** Avisa as duas contas do estado atual da relação. Devolve como `me` ficou. */
async function notifyPair(io: AppServer, me: string, other: string): Promise<FriendEntry | null> {
  const mine = await entryFor(me, other)
  const theirs = await entryFor(other, me)
  if (mine) emitToAccount(io, me, 'friend:updated', mine)
  else emitToAccount(io, me, 'friend:removed', other)
  if (theirs) emitToAccount(io, other, 'friend:updated', theirs)
  else emitToAccount(io, other, 'friend:removed', me)
  return mine
}

/**
 * Chamado pela presença quando a PRIMEIRA conexão de uma conta entra ou a ÚLTIMA sai:
 * os amigos ficam sabendo (só eles).
 */
export async function announcePresence(io: AppServer, accountId: string, online: boolean): Promise<void> {
  for (const friend of await friendIds(accountId)) emitToAccount(io, friend, 'friend:presence', { accountId, online })
}

const fail = (error: string): FriendResult => ({ ok: false, error })
const sameName = (a: string, b: string): boolean =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

export const friendsModule: ServerModule = {
  socket(io, socket) {
    const me = (): string | null => socket.data.user?.accountId ?? null

    socket.on('friend:list', (ack) => {
      if (typeof ack !== 'function') return
      void guard('friend:list', async () => {
        const id = me()
        if (!id) return ack([])
        ack(
          (await listRelations(id)).map((r) => ({
            account: r.account,
            status: r.status,
            since: r.since,
            online: r.status === 'friend' && isOnline(r.account.id)
          }))
        )
      })
    })

    socket.on('friend:request', (target, ack) => {
      if (typeof ack !== 'function') return
      void guard('friend:request', async () => {
        const id = me()
        if (!id) return ack(fail('Não autenticado'))
        const parsed = parseFriendTarget(target)
        if (!parsed) return ack(fail('Digite o nome e o id, assim: Ana#1234'))
        const limited = limiters.friend.take(id)
        if (!limited.ok) return ack(fail(`Muitos pedidos seguidos. ${retryText(limited.retryAfterMs)}`))
        const other = await findAccountByTag(parsed.tag)
        // nome e id precisam bater (o id sozinho não basta: evita adicionar alguém por engano)
        if (!other || !sameName(other.name, parsed.name)) return ack(fail('Ninguém com esse nome#id'))
        if (other.id === id) return ack(fail('Você não pode adicionar a si mesmo'))

        const mine = await getRelation(id, other.id)
        const theirs = await getRelation(other.id, id)
        if (mine?.status === 'blocked') return ack(fail('Você bloqueou essa pessoa. Desbloqueie antes de pedir amizade.'))
        // bloqueado por ela: mensagem genérica (não revela o bloqueio)
        if (theirs?.status === 'blocked') return ack(fail('Não foi possível enviar o pedido'))
        if (mine?.status === 'friend') return ack(fail('Vocês já são amigos'))
        if (mine?.status === 'outgoing') return ack(fail('Pedido já enviado'))
        if (mine?.status === 'incoming') {
          // ela já tinha pedido: pedir de volta aceita
          await makeFriends(id, other.id)
        } else {
          if ((await countOutgoing(id)) >= FRIEND_PENDING_MAX) return ack(fail('Você tem pedidos pendentes demais'))
          await sendRequest(id, other.id)
        }
        ack({ ok: true, entry: await notifyPair(io, id, other.id) })
      })
    })

    socket.on('friend:accept', (otherId, ack) => {
      if (typeof ack !== 'function') return
      void guard('friend:accept', async () => {
        const id = me()
        if (!id) return ack(fail('Não autenticado'))
        if (!isUuid(otherId) || (await getRelation(id, otherId))?.status !== 'incoming') return ack(fail('Pedido não encontrado'))
        await makeFriends(id, otherId)
        ack({ ok: true, entry: await notifyPair(io, id, otherId) })
      })
    })

    socket.on('friend:decline', (otherId, ack) => {
      if (typeof ack !== 'function') return
      void guard('friend:decline', async () => {
        const id = me()
        if (!id) return ack(fail('Não autenticado'))
        const status = isUuid(otherId) ? (await getRelation(id, otherId))?.status : undefined
        if (status !== 'incoming' && status !== 'outgoing') return ack(fail('Pedido não encontrado'))
        await deletePair(id, otherId)
        await notifyPair(io, id, otherId)
        ack({ ok: true, entry: null })
      })
    })

    socket.on('friend:remove', (otherId, ack) => {
      if (typeof ack !== 'function') return
      void guard('friend:remove', async () => {
        const id = me()
        if (!id) return ack(fail('Não autenticado'))
        if (!isUuid(otherId) || (await getRelation(id, otherId))?.status !== 'friend') return ack(fail('Vocês não são amigos'))
        await deletePair(id, otherId)
        await notifyPair(io, id, otherId)
        ack({ ok: true, entry: null })
      })
    })

    socket.on('friend:block', (otherId, ack) => {
      if (typeof ack !== 'function') return
      void guard('friend:block', async () => {
        const id = me()
        if (!id) return ack(fail('Não autenticado'))
        if (!isUuid(otherId) || otherId === id) return ack(fail('Conta inválida'))
        try {
          await block(id, otherId)
        } catch {
          return ack(fail('Conta não encontrada')) // id que não é de conta nenhuma (chave estrangeira)
        }
        // chamada em andamento na conversa dos dois (v3): o bloqueio encerra para ambos
        const dm = await findDm(id, otherId)
        if (dm) leaveDmVoice(io, dm.id)
        ack({ ok: true, entry: await notifyPair(io, id, otherId) })
      })
    })

    socket.on('friend:unblock', (otherId, ack) => {
      if (typeof ack !== 'function') return
      void guard('friend:unblock', async () => {
        const id = me()
        if (!id) return ack(fail('Não autenticado'))
        if (!isUuid(otherId) || !(await unblock(id, otherId))) return ack(fail('Essa pessoa não está bloqueada'))
        await notifyPair(io, id, otherId)
        ack({ ok: true, entry: null })
      })
    })
  }
}
