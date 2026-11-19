// Preferências da conta (v5): tema ativo e temas salvos. Vêm do servidor depois do `hello`.
import { DEFAULT_THEME, type SavedTheme, type ThemeConfig } from '@shared/types'

export interface PreferencesState {
  /** tema ativo da conta (o que está aplicado na tela) */
  theme: ThemeConfig
  /** temas próprios salvos (até 10) */
  savedThemes: SavedTheme[]
  /** false até as preferências da conta chegarem */
  preferencesLoaded: boolean
  mutedChannels: string[]
  doNotDisturb: boolean
}

export const preferencesInitial: PreferencesState = {
  theme: DEFAULT_THEME,
  savedThemes: [],
  preferencesLoaded: false,
  mutedChannels: [],
  doNotDisturb: false
}
