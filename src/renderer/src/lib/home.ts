// Contas da Home (B7): o selo do ícone da Home na barra de úteis.
import type { DmEntry, FriendEntry } from '@shared/types'
import { incomingCount } from './friends'

/** Quantos avisos a Home tem: pedidos de amizade recebidos + conversas com mensagem não lida. */
export function homeBadge(friends: readonly FriendEntry[], dms: readonly DmEntry[], unread: Record<string, boolean>): number {
  return incomingCount(friends) + dms.filter((d) => unread[d.channel.id]).length
}

/** A comunidade tem canal com mensagem não lida? (a bolinha no ícone da comunidade) */
export function communityUnread(channelIds: readonly string[], unread: Record<string, boolean>): boolean {
  return channelIds.some((id) => unread[id])
}
