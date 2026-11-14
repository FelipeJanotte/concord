// Salas de voz.
import type { VoiceState } from '@shared/types'

export interface VoiceSliceState {
  /** quem está em qual sala (lista completa vinda do servidor) */
  voice: VoiceState[]
  myVoiceChannelId: string | null
  joiningVoice: boolean
  muted: boolean
  deafened: boolean
  /** na sala de voz sem microfone (só ouvindo) */
  noMic: boolean
  speaking: Record<string, boolean>
}

export const voiceInitial: VoiceSliceState = {
  voice: [],
  myVoiceChannelId: null,
  joiningVoice: false,
  muted: false,
  deafened: false,
  noMic: false,
  speaking: {}
}
