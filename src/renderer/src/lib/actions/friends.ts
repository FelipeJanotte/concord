// Amizades e conversas privadas (v3, A6/A7): listas na store, avisos do servidor e as ações da tela.
import type { DmEntry, FriendEntry, FriendResult } from '@shared/types'
import { getSocket, requireSocket, set, type AppSocket } from '../core'

function upsertFriend(list: FriendEntry[], entry: FriendEntry): FriendEntry[] {
  const i = list.findIndex((e) => e.account.id === entry.account.id)
  return i < 0 ? [...list, entry] : list.map((e, j) => (j === i ? entry : e))
}

/** Põe a conversa no topo (nova ou com atividade agora). */
function bumpDm(list: DmEntry[], dm: DmEntry): DmEntry[] {
  return [dm, ...list.filter((d) => d.channel.id !== dm.channel.id)]
}

export function bindFriendsEvents(s: AppSocket): void {
  s.on('friend:updated', (entry) => set((st) => ({ friends: upsertFriend(st.friends, entry) })))
  s.on('friend:removed', (accountId) => set((st) => ({ friends: st.friends.filter((e) => e.account.id !== accountId) })))
  s.on('friend:presence', ({ accountId, online }) =>
    set((st) => ({
      friends: st.friends.map((e) => (e.account.id === accountId && e.status === 'friend' ? { ...e, online } : e))
    }))
  )
  s.on('dm:created', (dm) => set((st) => ({ dms: bumpDm(st.dms, dm) })))
  // mensagem numa conversa: ela sobe para o topo da lista
  s.on('message:new', (message) =>
    set((st) => {
      const dm = st.dms.find((d) => d.channel.id === message.channelId)
      return dm && st.dms[0] !== dm ? { dms: bumpDm(st.dms, dm) } : {}
    })
  )
}

/** Carrega amizades e conversas (chamado depois do `hello`, que é quando o servidor sabe quem eu sou). */
export async function loadFriendsAndDms(): Promise<void> {
  const s = getSocket()
  if (!s) return
  const [friends, dms] = await Promise.all([s.emitWithAck('friend:list'), s.emitWithAck('dm:list')])
  if (getSocket() !== s) return // saiu ou reconectou enquanto carregava
  set({ friends, dms, friendsLoaded: true })
}

/** O estado novo já chega por `friend:updated`/`friend:removed`; aqui só vira erro legível. */
function unwrap(res: FriendResult): FriendEntry | null {
  if (!res.ok) throw new Error(res.error)
  return res.entry
}

/** Pedido por `nome#id` (o mesmo texto que a pessoa digitou). */
export async function sendFriendRequest(target: string): Promise<FriendEntry | null> {
  return unwrap(await requireSocket().emitWithAck('friend:request', target.trim()))
}

export async function acceptFriend(accountId: string): Promise<FriendEntry | null> {
  return unwrap(await requireSocket().emitWithAck('friend:accept', accountId))
}

/** Recusa um pedido recebido ou cancela um enviado. */
export async function declineFriend(accountId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('friend:decline', accountId))
}

export async function removeFriend(accountId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('friend:remove', accountId))
}

export async function blockAccount(accountId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('friend:block', accountId))
}

export async function unblockAccount(accountId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('friend:unblock', accountId))
}

/** Abre (ou recupera) a conversa com a pessoa e a põe no topo da lista. Para mostrar o chat, use `dm.channel.id`. */
export async function openDm(accountId: string): Promise<DmEntry> {
  const res = await requireSocket().emitWithAck('dm:open', accountId)
  if (!res.ok) throw new Error(res.error)
  set((st) => ({ dms: bumpDm(st.dms, res.dm) }))
  return res.dm
}
