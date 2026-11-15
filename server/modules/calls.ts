/**
 * Chamadas privadas (v3, B8): o "telefone" das conversas — tocar, atender, recusar, cancelar,
 * desligar e o tempo limite. O áudio é a sala de voz da própria conversa (`voice:join` com o id
 * do canal `dm`, em `server/modules/voice.ts`). Contrato em `src/shared/types/calls.ts`; skill `concord-calls`.
 *
 * Em memória (uma chamada por conversa e por pessoa): reiniciar o servidor encerra todas.
 */
import {
  CALL_RING_MS,
  type CallEndReason,
  type CallInfo,
  type CallResult,
  type OkResult
} from '../../src/shared/types'
import { allowed, dmMembersOf } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { liveKitConfig } from '../livekit'
import { limiters, retryText } from '../middleware/rate-limit'
import { emitToAccount } from './friends'
import { leaveDmVoice, onVoiceRoomsChange, voiceSocketsIn } from './voice'

interface Call extends CallInfo {
  /** tempo limite: tocando sem resposta, ou atendida e ninguém entrou na sala */
  timer: ReturnType<typeof setTimeout> | null
  /** alguém já esteve na sala da conversa depois de atender (para saber quando "os dois saíram") */
  joined: boolean
}

/** canal `dm` → chamada em andamento */
const calls = new Map<string, Call>()

/** Tempo de toque; `CALL_RING_MS` no ambiente encurta nos testes. */
function ringTimeout(): number {
  return Number(process.env.CALL_RING_MS) || CALL_RING_MS
}

const info = ({ channelId, callerId, calleeId, status, since }: Call): CallInfo => ({
  channelId,
  callerId,
  calleeId,
  status,
  since
})

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Chamadas em que a conta está (como quem liga ou quem recebe). */
export function callsOf(accountId: string): CallInfo[] {
  return [...calls.values()].filter((c) => c.callerId === accountId || c.calleeId === accountId).map(info)
}

function inCall(accountId: string): boolean {
  return callsOf(accountId).length > 0
}

function emitBoth(io: AppServer, call: Call): void {
  const payload = info(call)
  emitToAccount(io, call.callerId, 'call:updated', payload)
  emitToAccount(io, call.calleeId, 'call:updated', payload)
}

function arm(io: AppServer, call: Call, reason: CallEndReason): void {
  if (call.timer) clearTimeout(call.timer)
  call.timer = setTimeout(() => endCall(io, call.channelId, reason), ringTimeout())
  call.timer.unref?.()
}

/**
 * Encerra a chamada da conversa: avisa os dois (`call:ended`, antes do `voice:state`) e tira
 * todo mundo da sala. Não faz nada se não há chamada. Usado também pelo bloqueio (`friend:block`).
 */
export function endCall(io: AppServer, channelId: string, reason: CallEndReason): void {
  const call = calls.get(channelId)
  if (!call) return
  calls.delete(channelId)
  if (call.timer) clearTimeout(call.timer)
  const ended = { channelId, callerId: call.callerId, calleeId: call.calleeId, reason }
  emitToAccount(io, call.callerId, 'call:ended', ended)
  emitToAccount(io, call.calleeId, 'call:ended', ended)
  leaveDmVoice(io, channelId)
}

/** Chamada atendida: quando os dois saem da sala da conversa, acabou. */
function watchRooms(io: AppServer): void {
  for (const call of [...calls.values()]) {
    if (call.status !== 'active') continue
    const someone = voiceSocketsIn(call.channelId).length > 0
    if (someone && !call.joined) {
      call.joined = true
      if (call.timer) clearTimeout(call.timer)
      call.timer = null
    } else if (!someone && call.joined) {
      endCall(io, call.channelId, 'ended')
    }
  }
}

let watching = false

/** A conversa existe e a conta é membro? Devolve a outra pessoa. */
function otherMember(channelId: unknown, accountId: string): string | null {
  if (typeof channelId !== 'string') return null
  const members = dmMembersOf(channelId)
  if (!members?.includes(accountId)) return null
  return members[0] === accountId ? members[1] : members[0]
}

export const callsModule: ServerModule = {
  init() {
    if (watching) return
    watching = true
    onVoiceRoomsChange(watchRooms)
  },

  socket(io, socket) {
    const me = (): string | undefined => socket.data.user?.accountId

    socket.on('call:invite', (channelId, ack) => {
      if (typeof ack !== 'function') return
      void guard('call:invite', async () => {
        const id = me()
        if (!id) return ack(fail('Não autenticado'))
        const other = otherMember(channelId, id)
        if (!other) return ack(fail('Conversa não encontrada'))
        if (!liveKitConfig) return ack(fail('A voz não está configurada neste servidor'))
        const limited = limiters.call.take(id)
        if (!limited.ok) return ack(fail(`Muitas ligações seguidas. ${retryText(limited.retryAfterMs)}`))
        // bloqueio (de qualquer lado): a mensagem não diz quem bloqueou
        if (!(await allowed(id, 'connect', channelId))) return ack(fail('Não foi possível ligar'))
        if (calls.has(channelId)) return ack(fail('Já há uma chamada nesta conversa'))
        if (inCall(id)) return ack(fail('Você já está em outra chamada'))
        if (inCall(other)) return ack(fail('Essa pessoa está em outra chamada'))
        const call: Call = {
          channelId,
          callerId: id,
          calleeId: other,
          status: 'ringing',
          since: Date.now(),
          timer: null,
          joined: false
        }
        calls.set(channelId, call)
        arm(io, call, 'missed')
        emitBoth(io, call)
        ack({ ok: true, call: info(call) })
      })
    })

    socket.on('call:accept', (channelId, ack) => {
      if (typeof ack !== 'function') return
      const id = me()
      const call = typeof channelId === 'string' ? calls.get(channelId) : undefined
      if (!id || !call || call.calleeId !== id || call.status !== 'ringing') {
        return ack(fail('Essa chamada não está tocando'))
      }
      call.status = 'active'
      call.since = Date.now()
      // atendeu e ninguém entrou na sala a tempo: encerra (ex.: o app fechou no meio)
      arm(io, call, 'ended')
      emitBoth(io, call)
      watchRooms(io) // quem ligou já está na sala
      ack({ ok: true, call: info(call) } satisfies CallResult)
    })

    const finish =
      (rule: (call: Call, id: string) => CallEndReason | null, error: string) =>
      (channelId: string, ack: (res: OkResult) => void): void => {
        if (typeof ack !== 'function') return
        const id = me()
        const call = typeof channelId === 'string' ? calls.get(channelId) : undefined
        const reason = id && call ? rule(call, id) : null
        if (!call || !reason) return ack(fail(error))
        endCall(io, call.channelId, reason)
        ack({ ok: true })
      }

    socket.on(
      'call:decline',
      finish((c, id) => (c.calleeId === id && c.status === 'ringing' ? 'declined' : null), 'Essa chamada não está tocando')
    )
    socket.on(
      'call:cancel',
      finish((c, id) => (c.callerId === id && c.status === 'ringing' ? 'cancelled' : null), 'Essa chamada não está tocando')
    )
    socket.on(
      'call:end',
      finish((c, id) => {
        if (c.callerId !== id && c.calleeId !== id) return null
        if (c.status === 'active') return 'ended'
        return c.callerId === id ? 'cancelled' : 'declined'
      }, 'Nenhuma chamada nesta conversa')
    )

    socket.on('call:list', (ack) => {
      if (typeof ack !== 'function') return
      const id = me()
      ack(id ? callsOf(id) : [])
    })

    // Saiu de todas as conexões enquanto tocava: quem ligou desistiu; quem recebe perdeu a chamada.
    socket.on('disconnect', () => {
      const id = me()
      if (!id || stillOnline(io, socket, id)) return
      for (const call of [...calls.values()]) {
        if (call.status !== 'ringing') continue
        if (call.callerId === id) endCall(io, call.channelId, 'cancelled')
        else if (call.calleeId === id) endCall(io, call.channelId, 'missed')
      }
    })
  }
}

function stillOnline(io: AppServer, socket: AppSocket, accountId: string): boolean {
  for (const s of io.sockets.sockets.values()) {
    if (s.id !== socket.id && s.data.user?.accountId === accountId) return true
  }
  return false
}
