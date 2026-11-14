/**
 * CONTRATO — v3 conversas privadas (A7 servidor; a lista de DMs entra no casco da Home da B7).
 *
 * Um DM é um canal do tipo `dm` com exatamente duas contas (membros). Mensagens, anexos,
 * histórico e "digitando" usam os MESMOS eventos dos canais (`message:*`, `typing`,
 * `POST /uploads`): só os membros recebem e leem. DMs nunca aparecem na lista de canais
 * da comunidade (`hello.state.channels`, `channels:visible`).
 *
 * Abrir: só entre amigos, ou se a conversa já existe (amizade desfeita não apaga o histórico).
 * Bloqueio (de qualquer lado): não abre, não envia; o histórico continua legível pelos membros.
 */
import type { Channel } from './channel'
import type { FriendAccount } from './friends'

export interface DmEntry {
  channel: Channel
  /** a outra pessoa da conversa */
  other: FriendAccount
}

export type DmOpenResult = { ok: true; dm: DmEntry } | { ok: false; error: string }

// ---------- Eventos ----------

export interface DmsServerEvents {
  /** alguém abriu uma conversa comigo (ou eu, em outra janela) */
  'dm:created': (dm: DmEntry) => void
}

export interface DmsClientEvents {
  /** minhas conversas */
  'dm:list': (ack: (dms: DmEntry[]) => void) => void
  /** abre (ou devolve a que já existe) a conversa com `accountId` */
  'dm:open': (accountId: string, ack: (res: DmOpenResult) => void) => void
}
