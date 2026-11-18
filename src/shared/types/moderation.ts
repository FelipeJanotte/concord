/**
 * CONTRATO — v2, B6 (moderação): expulsar da voz, mover para outra sala, silenciar pelo servidor e apagar mensagem.
 *
 * Regras (o servidor confere tudo; a tela só esconde o que daria erro):
 * - mover para outra sala de voz: mesma hierarquia do expulsar, mas basta `moveMembers` ou `manageMembers`
 *   (`canMoveMember`); a sala de destino tem de ser de voz, visível para
 *   quem move, e a pessoa tem de poder ver e entrar nela (`connect`). Chamada privada não entra. Quem é
 *   movido recebe `moderation:moved` e o app troca de sala pelo `voice:join` de sempre;
 * - expulsar e silenciar exigem `manageMembers` e alguém **abaixo** de quem modera
 *   (`canModerate`): ninguém mexe na dona, em quem está no seu nível ou acima, nem em si mesmo;
 * - silenciar vale para a **conta** (todas as conexões dela) e continua valendo se ela sair e
 *   voltar à voz, até alguém tirar ou o servidor reiniciar. No LiveKit é igual a perder `speak`:
 *   o microfone deixa de ser aceito (mais forte que só mutar a faixa, que a pessoa desmutaria);
 * - apagar mensagem: o próprio autor, ou quem tem `manageMessages`; nos dois casos precisa ver o canal.
 *   Os anexos da mensagem são apagados junto.
 */
import { globalPermissions, hasFullAccess, highestPosition, type AccessState, type GlobalPermission, type OkResult } from './permissions'

/**
 * `actor` pode expulsar/silenciar `target`? (mesma regra no servidor e na tela)
 * Dona pode todo mundo menos ela mesma; os demais precisam de `manageMembers` e de um
 * cargo mais alto que o mais alto do alvo.
 */
export function canModerate(access: AccessState, actor: string, target: string): boolean {
  return outranks(access, actor, target, ['manageMembers'])
}

export function canMoveMember(access: AccessState, actor: string, target: string): boolean {
  return outranks(access, actor, target, ['moveMembers', 'manageMembers'])
}

function outranks(access: AccessState, actor: string, target: string, anyOf: GlobalPermission[]): boolean {
  if (actor === target || target === access.ownerAccountId) return false
  if (hasFullAccess(access, actor)) return true
  const mine = globalPermissions(access, actor)
  if (!anyOf.some((p) => mine.has(p))) return false
  return highestPosition(access, target) < highestPosition(access, actor)
}

/** Quem pode apagar a mensagem: o autor, ou quem tem `manageMessages` (ver o canal é conferido à parte). */
export function canDeleteMessage(access: AccessState, actor: string, authorAccountId: string | null): boolean {
  if (authorAccountId !== null && actor === authorAccountId) return true
  return globalPermissions(access, actor).has('manageMessages')
}

// ---------- Eventos ----------

export interface ModerationServerEvents {
  /** a mensagem foi apagada (para quem vê o canal) */
  'message:deleted': (payload: { channelId: string; messageId: string }) => void
  /** só para a conexão expulsa, logo antes do `voice:state` sem ela */
  'moderation:kicked': (payload: { channelId: string; by: string }) => void
  /** só para a conexão movida: entre na sala `channelId` (quem moveu = `by`) */
  'moderation:moved': (payload: { channelId: string; by: string }) => void
}

export interface ModerationClientEvents {
  /** tira a conexão `userId` (socket.id, igual ao `VoiceState.userId`) da sala de voz */
  'moderation:voice-kick': (payload: { userId: string }, ack: (res: OkResult) => void) => void
  /** leva a conexão `userId` para a sala de voz `channelId` */
  'moderation:voice-move': (payload: { userId: string; channelId: string }, ack: (res: OkResult) => void) => void
  /** silencia (ou tira o silêncio) da conta para todos, em qualquer sala de voz */
  'moderation:voice-mute': (payload: { accountId: string; muted: boolean }, ack: (res: OkResult) => void) => void
  /** apaga a mensagem (autor ou manageMessages) */
  'message:delete': (payload: { messageId: string }, ack: (res: OkResult) => void) => void
}
