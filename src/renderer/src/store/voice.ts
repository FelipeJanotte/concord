// Salas de voz.
import type { VoiceState } from '@shared/types'
import { DEFAULT_SCREEN_QUALITY, type ScreenQuality } from '@shared/screen'

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
  /** estou compartilhando a tela */
  sharing: boolean
  screenQuality: ScreenQuality
  /** quem tem tela disponível para assistir na sala atual (ids de conexão; inclui a própria, como prévia) */
  screens: string[]
  screenAudio: string[]
  /** minha câmera está ligada (B21) */
  cameraOn: boolean
  /** quem está com a câmera ligada na sala atual (ids de conexão; inclui a própria, como prévia) */
  cameras: string[]
  /** seletor de tela/janela aberto */
  screenPickerOpen: boolean
  /** pode falar na sala atual (v2, `speak`); sem isso entra só para ouvir */
  voiceCanSpeak: boolean
  /** pode compartilhar a tela na sala atual (v2, `share`) */
  voiceCanShare: boolean
  /** pode ligar a câmera na sala atual (B21, `video`) */
  voiceCanVideo: boolean
}

export const voiceInitial: VoiceSliceState = {
  voice: [],
  myVoiceChannelId: null,
  joiningVoice: false,
  muted: false,
  deafened: false,
  noMic: false,
  speaking: {},
  sharing: false,
  screenQuality: DEFAULT_SCREEN_QUALITY,
  screens: [],
  screenAudio: [],
  cameraOn: false,
  cameras: [],
  screenPickerOpen: false,
  voiceCanSpeak: true,
  voiceCanShare: true,
  voiceCanVideo: true
}
