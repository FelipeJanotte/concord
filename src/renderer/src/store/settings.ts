// Configurações do usuário: a janela única com menu lateral (Minha conta, Voz e vídeo, Aparência,
// Notificações). `settingsSection` = seção aberta; null = janela fechada. Só dado de tela, não é salvo.

export type SettingsSection = 'account' | 'voice' | 'appearance' | 'notifications'

export interface SettingsState {
  settingsSection: SettingsSection | null
}

export const settingsInitial: SettingsState = {
  settingsSection: null
}
