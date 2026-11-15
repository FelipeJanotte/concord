/**
 * Configurações do usuário (janela única com menu lateral). A engrenagem do painel da conta abre
 * "Minha conta"; os botões de configurações de voz (sala, chamada, "Voz conectada") abrem "Voz e vídeo".
 * Fechar manda o tema que ainda estiver pendente (o editor de Aparência agrupa os envios).
 */
import type { SettingsSection } from '@/store/settings'
import { get, set } from '../core'
import { flushPendingTheme } from './preferences'

export function openSettings(section: SettingsSection = 'account'): void {
  set({ settingsSection: section })
}

export function closeSettings(): void {
  if (get().settingsSection === null) return
  set({ settingsSection: null })
  void flushPendingTheme()
}
