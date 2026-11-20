/**
 * CONTRATO — v3 amizades (A6 servidor; a tela "Amigos" entra no casco da Home da B7).
 * Proposta para revisão do Dev B.
 *
 * Cada lado da relação tem o seu estado (`FriendStatus`), como no Discord:
 * - `friend`: amigos (os dois lados);
 * - `outgoing`: eu pedi, esperando a outra pessoa; `incoming`: me pediram;
 * - `blocked`: EU bloqueei. Quem foi bloqueado não vê nada (nem sabe), não consegue pedir
 *   amizade e deixa de ver se estou online.
 * Pedido por `nome#id` (o id é único). Se a outra pessoa já tinha me pedido, pedir de
 * volta aceita na hora. Online/offline só aparece para amigos.
 */

import type { CustomStatus } from './account'

export type FriendStatus = 'friend' | 'outgoing' | 'incoming' | 'blocked'

/** Dados públicos da outra conta (o mesmo que aparece na lista de membros). */
export interface FriendAccount {
  id: string
  name: string
  tag: string
  color: string
  avatarUrl: string | null
  bio?: string
  customStatus?: CustomStatus | null
}

export interface FriendEntry {
  account: FriendAccount
  status: FriendStatus
  /** quando a relação chegou neste estado (ms) */
  since: number
  /** só vem true para amigos que estão conectados */
  online: boolean
}

export type FriendResult = { ok: true; entry: FriendEntry | null } | { ok: false; error: string }

/** Quantos pedidos pendentes (enviados) uma conta pode ter ao mesmo tempo. */
export const FRIEND_PENDING_MAX = 50

/** Separa `nome#id` (aceita espaços em volta e no nome). null se não tiver `#id`. */
export function parseFriendTarget(raw: unknown): { name: string; tag: string } | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  const at = text.lastIndexOf('#')
  if (at <= 0) return null
  const name = text.slice(0, at).trim()
  const tag = text.slice(at + 1).trim()
  return name && /^[a-zA-Z0-9]{1,5}$/.test(tag) ? { name, tag } : null
}

// ---------- Eventos ----------

export interface FriendsServerEvents {
  /** a minha relação com alguém mudou (pedido novo, aceito, bloqueio...) — vai para todas as minhas conexões */
  'friend:updated': (entry: FriendEntry) => void
  /** a relação deixou de existir (recusado, desfeito, desbloqueado) */
  'friend:removed': (accountId: string) => void
  /** um amigo ficou online/offline */
  'friend:presence': (payload: { accountId: string; online: boolean }) => void
}

export interface FriendsClientEvents {
  'friend:list': (ack: (entries: FriendEntry[]) => void) => void
  /** `target` = "nome#id" */
  'friend:request': (target: string, ack: (res: FriendResult) => void) => void
  'friend:accept': (accountId: string, ack: (res: FriendResult) => void) => void
  /** recusa um pedido recebido OU cancela um enviado */
  'friend:decline': (accountId: string, ack: (res: FriendResult) => void) => void
  'friend:remove': (accountId: string, ack: (res: FriendResult) => void) => void
  'friend:block': (accountId: string, ack: (res: FriendResult) => void) => void
  'friend:unblock': (accountId: string, ack: (res: FriendResult) => void) => void
}
