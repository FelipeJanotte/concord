// Amizades e conversas privadas (v3). Carregadas depois do `hello`; mudanças chegam por friend:* e dm:created.
import type { DmEntry, FriendEntry } from '@shared/types'

export interface FriendsState {
  /** todas as minhas relações (amigos, pedidos e bloqueados); agrupar com `friendGroups` (lib/friends.ts) */
  friends: FriendEntry[]
  /** minhas conversas, a com atividade mais recente primeiro */
  dms: DmEntry[]
  /** false até a primeira lista chegar (a tela mostra "carregando" em vez de "nenhum amigo") */
  friendsLoaded: boolean
}

export const friendsInitial: FriendsState = {
  friends: [],
  dms: [],
  friendsLoaded: false
}
