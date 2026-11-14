/**
 * Preferências da conta guardadas no servidor (v5: tema ativo e temas salvos).
 * Acompanham a pessoa em qualquer computador; mudar numa janela muda nas outras
 * janelas da mesma conta (`preferences:updated`). Sem preferências salvas, o servidor
 * devolve `DEFAULT_THEME` e nenhum tema salvo.
 */
import type { SavedTheme, ThemeConfig } from './theme'

export interface Preferences {
  theme: ThemeConfig
  savedThemes: SavedTheme[]
}

/** Só os campos enviados mudam; `savedThemes` substitui a lista inteira. */
export interface PreferencesUpdate {
  theme?: ThemeConfig
  savedThemes?: SavedTheme[]
}

export type PreferencesResult = { ok: true; preferences: Preferences } | { ok: false; error: string }

// ---------- Eventos ----------

export interface PreferencesServerEvents {
  /** as preferências DESTA conta mudaram em outra janela */
  'preferences:updated': (preferences: Preferences) => void
}

export interface PreferencesClientEvents {
  'preferences:get': (ack: (preferences: Preferences) => void) => void
  'preferences:update': (update: PreferencesUpdate, ack: (res: PreferencesResult) => void) => void
}
