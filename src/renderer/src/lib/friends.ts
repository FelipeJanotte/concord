// Funções puras das amizades para a tela "Amigos" (B7): abas e ordenação.
import type { FriendEntry } from '@shared/types'

export interface FriendGroups {
  /** amigos conectados */
  online: FriendEntry[]
  /** todos os amigos */
  all: FriendEntry[]
  /** pedidos recebidos (primeiro) e enviados */
  pending: FriendEntry[]
  blocked: FriendEntry[]
}

const byName = (a: FriendEntry, b: FriendEntry): number =>
  a.account.name.localeCompare(b.account.name, 'pt-BR', { sensitivity: 'base' }) || a.account.tag.localeCompare(b.account.tag)

/** Separa as relações nas abas da tela, cada uma em ordem alfabética. */
export function friendGroups(entries: readonly FriendEntry[]): FriendGroups {
  const sorted = [...entries].sort(byName)
  const all = sorted.filter((e) => e.status === 'friend')
  return {
    online: all.filter((e) => e.online),
    all,
    pending: [...sorted.filter((e) => e.status === 'incoming'), ...sorted.filter((e) => e.status === 'outgoing')],
    blocked: sorted.filter((e) => e.status === 'blocked')
  }
}

/** Quantos pedidos recebidos esperam resposta (o selo na Home). */
export const incomingCount = (entries: readonly FriendEntry[]): number => entries.filter((e) => e.status === 'incoming').length
