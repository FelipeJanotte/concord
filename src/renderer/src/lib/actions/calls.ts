// Chamadas privadas (B8): o "telefone" das conversas. O áudio é a sala de voz da conversa
// (`joinVoice(dm.channel.id)`); aqui ficam tocar, atender, recusar, cancelar, desligar e os avisos.
import { callEndText, type CallInfo, type CallResult, type OkResult } from '@shared/types'
import { omit } from '../utils'
import { findDm } from '../dms'
import { Ringer } from '../sounds/ringtone'
import { voice } from '../voice'
import { get, getSocket, notify, requireSocket, set, type AppSocket } from '../core'
import { openDmChat } from './navigation'
import { joinVoice, OUT_OF_VOICE } from './voice'
import { leftVoiceRoom } from './voice-sounds'

export const ringer = new Ringer()

/** Volume do toque (de 0 a 1), pela saída escolhida nas configurações de voz. */
const RING_VOLUME = 0.8

/** Conversas em que EU encerrei a chamada (não preciso de aviso de que acabou). */
const endedByMe = new Set<string>()

/** Chamadas feitas por ESTA janela: só ela toca "chamando" (as outras conexões da conta ficam quietas). */
const placedHere = new Set<string>()

/** Toca o que for preciso: alguém me ligando tem prioridade sobre eu chamando alguém. */
export function syncRinger(): void {
  const st = get()
  const me = st.self?.accountId
  const ringing = Object.values(st.calls).filter((c) => c.status === 'ringing')
  const opts = { volume: RING_VOLUME, outputId: st.audioOutputId }
  if (ringing.some((c) => c.calleeId === me)) ringer.start('incoming', opts)
  else if (ringing.some((c) => c.callerId === me && placedHere.has(c.channelId))) ringer.start('outgoing', opts)
  else ringer.stop()
}

function store(call: CallInfo): void {
  set((st) => ({ calls: { ...st.calls, [call.channelId]: call } }))
  syncRinger()
}

/** Nome da outra pessoa da conversa (para os avisos). */
function otherName(channelId: string): string {
  return findDm(get().dms, channelId)?.other.name ?? 'A outra pessoa'
}

export function bindCallsEvents(s: AppSocket): void {
  s.on('call:updated', store)

  s.on('call:ended', (ended) => {
    placedHere.delete(ended.channelId)
    set((st) => ({ calls: omit(st.calls, ended.channelId) }))
    syncRinger()
    // sai da sala na hora (o voice:state sem mim vem logo depois e não repete o aviso)
    if (get().myVoiceChannelId === ended.channelId) {
      voice.teardown()
      set({ ...OUT_OF_VOICE })
      leftVoiceRoom()
    }
    const me = get().self?.accountId ?? ''
    const text = callEndText(ended, me, otherName(ended.channelId), endedByMe.delete(ended.channelId))
    if (text) notify(text, 'info')
  })

  // conexão caiu ou saí da conta: nada fica tocando (ao voltar, `loadCalls` traz o que ainda vale)
  s.on('disconnect', () => {
    placedHere.clear()
    set({ calls: {} })
    ringer.stop()
  })
}

/** Chamadas em andamento das minhas conversas (chamado depois do `hello`). */
export async function loadCalls(): Promise<void> {
  const s = getSocket()
  if (!s) return
  const list = await s.emitWithAck('call:list')
  if (getSocket() !== s) return
  set({ calls: Object.fromEntries(list.map((c) => [c.channelId, c])) })
  syncRinger()
}

function unwrapCall(res: CallResult): CallInfo {
  if (!res.ok) throw new Error(res.error)
  store(res.call)
  return res.call
}

/** Liga para a outra pessoa da conversa e já entra na sala, esperando atender. */
export async function startCall(channelId: string): Promise<void> {
  placedHere.add(channelId)
  const res = await requireSocket().emitWithAck('call:invite', channelId)
  if (!res.ok) placedHere.delete(channelId)
  unwrapCall(res)
  await joinVoice(channelId)
}

/** Atende: abre a conversa e entra na sala dela. */
export async function acceptCall(channelId: string): Promise<void> {
  unwrapCall(await requireSocket().emitWithAck('call:accept', channelId))
  openDmChat(channelId)
  await joinVoice(channelId)
}

async function finish(event: 'call:decline' | 'call:cancel' | 'call:end', channelId: string): Promise<void> {
  endedByMe.add(channelId)
  const res: OkResult = await requireSocket().emitWithAck(event, channelId)
  if (!res.ok) {
    endedByMe.delete(channelId)
    throw new Error(res.error)
  }
}

/** Recusar uma chamada que está tocando para mim. */
export const declineCall = (channelId: string): Promise<void> => finish('call:decline', channelId)

/** Desistir de uma chamada que eu fiz, antes de atenderem. */
export const cancelCall = (channelId: string): Promise<void> => finish('call:cancel', channelId)

/** Desligar (para os dois; o servidor tira todo mundo da sala). */
export const hangUp = (channelId: string): Promise<void> => finish('call:end', channelId)
