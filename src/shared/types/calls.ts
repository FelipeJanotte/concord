/**
 * CONTRATO — v3 chamadas privadas (B8).
 *
 * A chamada acontece na sala de voz da própria conversa (`voice:join` com o id do canal `dm`,
 * skill `concord-voice`). Estes eventos só cuidam do "telefone": tocar, atender, recusar,
 * cancelar, desligar e o tempo limite. Uma chamada por conversa e por pessoa.
 *
 * Fluxo: quem liga manda `call:invite` e entra na sala; a outra pessoa recebe `call:updated`
 * (`ringing`) em todas as conexões e o app toca. `call:accept` vira `active` e ela entra na sala.
 * Sem resposta em `CALL_RING_MS`, acaba como `missed`. Acaba também quando os dois saem da sala,
 * quando alguém desliga (`call:end`) ou com bloqueio. O fim chega como `call:ended` e o servidor
 * tira todo mundo da sala da conversa.
 */
import type { OkResult } from './permissions'

export type CallStatus = 'ringing' | 'active'

export interface CallInfo {
  /** canal `dm` da conversa (também é o nome da sala no LiveKit) */
  channelId: string
  /** conta que ligou */
  callerId: string
  /** conta que recebe */
  calleeId: string
  status: CallStatus
  /** quando começou a tocar ou, depois de atendida, quando foi atendida (ms) */
  since: number
}

/**
 * Por que acabou:
 * - `declined`: quem recebe recusou; `cancelled`: quem ligou desistiu antes de atenderem;
 * - `missed`: ninguém atendeu a tempo (ou quem recebe saiu de todas as conexões);
 * - `ended`: alguém desligou ou os dois saíram da sala; `blocked`: bloqueio entre os dois.
 */
export type CallEndReason = 'declined' | 'cancelled' | 'missed' | 'ended' | 'blocked'

export interface CallEnded {
  channelId: string
  callerId: string
  calleeId: string
  reason: CallEndReason
}

/** Quanto tempo toca antes de virar "chamada perdida" (ms). */
export const CALL_RING_MS = 30_000

export type CallResult = { ok: true; call: CallInfo } | { ok: false; error: string }

/** Aviso que cada lado vê quando a chamada acaba (null = nada a dizer, ex.: eu mesmo desliguei). */
export function callEndText(ended: CallEnded, me: string, otherName: string, endedByMe: boolean): string | null {
  if (endedByMe) return null
  const iCalled = ended.callerId === me
  switch (ended.reason) {
    case 'declined':
      return iCalled ? `${otherName} recusou a chamada.` : null
    case 'missed':
      return iCalled ? `${otherName} não atendeu.` : `Chamada perdida de ${otherName}.`
    case 'cancelled':
      return iCalled ? null : `Chamada perdida de ${otherName}.`
    case 'ended':
    case 'blocked':
      return 'Chamada encerrada.'
  }
}

// ---------- Eventos ----------

export interface CallsServerEvents {
  /** chamada nova (tocando) ou atendida; vai para todas as conexões das duas contas */
  'call:updated': (call: CallInfo) => void
  /** a chamada acabou (vem antes do `voice:state` que tira as pessoas da sala) */
  'call:ended': (ended: CallEnded) => void
}

export interface CallsClientEvents {
  /** ligar para a outra pessoa da conversa `channelId` */
  'call:invite': (channelId: string, ack: (res: CallResult) => void) => void
  /** quem recebe atende (depois entra na sala com `voice:join`) */
  'call:accept': (channelId: string, ack: (res: CallResult) => void) => void
  /** quem recebe recusa */
  'call:decline': (channelId: string, ack: (res: OkResult) => void) => void
  /** quem ligou desiste antes de atenderem */
  'call:cancel': (channelId: string, ack: (res: OkResult) => void) => void
  /** desligar (qualquer um dos dois; tocando, vale como recusar/cancelar) */
  'call:end': (channelId: string, ack: (res: OkResult) => void) => void
  /** chamadas em andamento das minhas conversas (ao conectar) */
  'call:list': (ack: (calls: CallInfo[]) => void) => void
}
