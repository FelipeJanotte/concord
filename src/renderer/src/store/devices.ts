// Dispositivos de áudio e volume por pessoa (B4). Preferências desta máquina (salvas no localStorage).

export interface DevicesState {
  /** microfone escolhido; null = padrão do sistema */
  audioInputId: string | null
  /** saída (alto-falante/fone) escolhida; null = padrão do sistema */
  audioOutputId: string | null
  /** volume da voz de cada pessoa, por conta (0 a 1); quem não aparece está em 100% */
  userVolumes: Record<string, number>
  /** contas que silenciei só para mim (o volume em `userVolumes` fica guardado para quando voltar) */
  userMuted: Record<string, true>
  /** som quando alguém entra/sai da minha sala de voz (B16) */
  voiceSoundsEnabled: boolean
  /** volume desses sons, de 0 a 1 */
  voiceSoundsVolume: number
  /** diálogo "Configurações de voz" aberto */
  deviceSettingsOpen: boolean
}

export const devicesInitial: DevicesState = {
  audioInputId: null,
  audioOutputId: null,
  userVolumes: {},
  userMuted: {},
  voiceSoundsEnabled: true,
  voiceSoundsVolume: 0.5,
  deviceSettingsOpen: false
}
