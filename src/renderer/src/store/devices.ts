import { SENSITIVITY_DEFAULT_DB } from '@/lib/mic-gate'
// Dispositivos de áudio e volume por pessoa (B4). Preferências desta máquina (salvas no localStorage).
import type { LevelerTarget } from '@/lib/leveler/level'
import type { LevelerGains } from '@/lib/leveler/leveler'

export interface DevicesState {
  /** microfone escolhido; null = padrão do sistema */
  audioInputId: string | null
  /** saída (alto-falante/fone) escolhida; null = padrão do sistema */
  audioOutputId: string | null
  /** câmera escolhida (B21); null = padrão do sistema */
  cameraId: string | null
  /** volume da voz de cada pessoa, por conta (0 a 1); quem não aparece está em 100% */
  userVolumes: Record<string, number>
  /** contas que silenciei só para mim (o volume em `userVolumes` fica guardado para quando voltar) */
  userMuted: Record<string, true>
  screenVolumes: Record<string, number>
  screenMuted: Record<string, true>
  /** som quando alguém entra/sai da minha sala de voz (B16) */
  voiceSoundsEnabled: boolean
  /** volume desses sons, de 0 a 1 */
  voiceSoundsVolume: number
  /** volume do microfone, de 0 a 2 (200%); 1 = como o sistema entrega */
  micGain: number
  /** volume de saída, de 0 a 1: voz de todos, áudio da tela, efeitos sonoros e sons da sala */
  outputVolume: number
  soundboardVolume: number
  /** supressão de ruído automática ligada (B13); desligada = microfone cru */
  noiseSuppression: boolean
  /** o que a supressão está fazendo agora; 'off' = desligada; null = fora de sala */
  noiseMode: 'off' | 'advanced' | 'light-fallback' | null
  micSensitivity: number
  micLevel: number | null
  voiceLeveler: boolean
  voiceLevelerTarget: LevelerTarget
  levelerGains: LevelerGains
}

export const devicesInitial: DevicesState = {
  audioInputId: null,
  audioOutputId: null,
  cameraId: null,
  userVolumes: {},
  userMuted: {},
  screenVolumes: {},
  screenMuted: {},
  voiceSoundsEnabled: true,
  voiceSoundsVolume: 0.5,
  micGain: 1,
  outputVolume: 1,
  soundboardVolume: 1,
  noiseSuppression: true,
  noiseMode: null,
  micSensitivity: SENSITIVITY_DEFAULT_DB,
  micLevel: null,
  voiceLeveler: false,
  voiceLevelerTarget: 'medium',
  levelerGains: {}
}
