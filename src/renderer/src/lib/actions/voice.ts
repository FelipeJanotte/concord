// Entrar/sair da sala de voz, mute e deafen. A conexão com o LiveKit fica em `lib/voice.ts`.
import { get, getSocket, notify, set, type AppSocket } from '../core'
import { voice } from '../voice'

// A sala do LiveKit caiu sem a pessoa pedir (removida, sala encerrada, servidor de voz fora do ar).
voice.onUnexpectedDisconnect = (message) => {
  set({ myVoiceChannelId: null, speaking: {}, noMic: false })
  notify(message)
}

export function bindVoiceEvents(s: AppSocket): void {
  s.on('voice:state', (states) => set({ voice: states }))
}

function describeMediaError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Permissão de microfone negada.'
    if (err.name === 'NotFoundError') return 'Nenhum microfone encontrado.'
    if (err.name === 'NotReadableError') return 'O microfone está sendo usado por outro programa.'
  }
  return err instanceof Error ? err.message : 'Falha ao entrar no canal de voz'
}

export async function joinVoice(channelId: string): Promise<void> {
  const st = get()
  set({ view: { kind: 'voice', channelId } })
  if (st.myVoiceChannelId === channelId || st.joiningVoice) return
  set({ joiningVoice: true })
  try {
    const { micError } = await voice.join(channelId)
    set({ myVoiceChannelId: channelId, noMic: micError !== null })
    if (micError !== null) {
      notify(`${describeMediaError(micError)} Você entrou só para ouvir.`, 'info')
    }
  } catch (err) {
    notify(describeMediaError(err))
  } finally {
    set({ joiningVoice: false })
  }
}

export function leaveVoice(): void {
  voice.leave()
  set({ myVoiceChannelId: null, speaking: {}, noMic: false })
}

function applyAudio(muted: boolean, deafened: boolean): void {
  set({ muted, deafened })
  voice.setMuted(muted)
  voice.setDeafened(deafened)
  // Sem microfone, os outros sempre veem o usuário como silenciado.
  if (get().myVoiceChannelId) getSocket()?.emit('voice:update', { muted: muted || get().noMic, deafened })
}

export function toggleMute(): void {
  const { muted, deafened, noMic } = get()
  if (noMic) {
    if (deafened) applyAudio(muted, false)
    else notify('Nenhum microfone disponível. Saia e entre de novo na sala depois de conectá-lo.', 'info')
    return
  }
  if (deafened) applyAudio(false, false)
  else applyAudio(!muted, false)
}

export function toggleDeafen(): void {
  const { deafened } = get()
  applyAudio(!deafened, !deafened)
}
