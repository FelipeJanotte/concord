/**
 * Tema e temas salvos da conta (v5): carrega depois do `hello`, aplica na tela, sincroniza com as outras janelas
 * (`preferences:updated`) e salva no servidor. O seletor de cor do editor manda mudanças seguidas: o envio é
 * agrupado (`THEME_SAVE_DELAY_MS`) e a tela muda na hora.
 */
import { validateTheme, type Preferences, type SavedTheme, type ThemeConfig } from '@shared/types'
import { applyTheme, saveLocalTheme } from '../theme/apply'
import { get, getSocket, notify, requireSocket, set, type AppSocket } from '../core'

export const THEME_SAVE_DELAY_MS = 400

let pendingTheme: ThemeConfig | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

function applyAccountPreferences(prefs: Preferences): void {
  set({ theme: prefs.theme, savedThemes: prefs.savedThemes, preferencesLoaded: true })
  applyTheme(prefs.theme)
  saveLocalTheme(prefs.theme)
}

export function bindPreferencesEvents(s: AppSocket): void {
  // mudou em outra janela da mesma conta
  s.on('preferences:updated', (prefs) => {
    if (pendingTheme) return // a mudança desta janela ainda vai sair; ela vence
    applyAccountPreferences(prefs)
  })
}

/** Carrega as preferências da conta (chamado depois do `hello`). */
export async function loadPreferences(): Promise<void> {
  const s = getSocket()
  if (!s) return
  const prefs = await s.emitWithAck('preferences:get')
  if (getSocket() !== s) return
  applyAccountPreferences(prefs)
}

/** Só mostra o tema (prévia ao vivo no editor), sem salvar. Para voltar: `previewTheme(get().theme)`. */
export function previewTheme(theme: ThemeConfig): void {
  const valid = validateTheme(theme)
  if (valid) applyTheme(valid)
}

async function flushTheme(): Promise<void> {
  const theme = pendingTheme
  pendingTheme = null
  if (!theme) return
  const s = getSocket()
  if (!s) return
  const res = await s.emitWithAck('preferences:update', { theme })
  if (!res.ok) notify(`Não foi possível salvar o tema: ${res.error}`)
}

/** Troca o tema da conta: a tela muda na hora e o servidor recebe depois de um instante (agrupando mudanças seguidas). */
export function setTheme(theme: ThemeConfig): void {
  const valid = validateTheme(theme)
  if (!valid) throw new Error('Tema inválido')
  set({ theme: valid })
  applyTheme(valid)
  saveLocalTheme(valid)
  pendingTheme = valid
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushTheme(), THEME_SAVE_DELAY_MS)
}

/** Manda já o tema pendente (ex.: ao fechar o editor). */
export function flushPendingTheme(): Promise<void> {
  clearTimeout(saveTimer)
  return flushTheme()
}

/** Substitui a lista de temas salvos (até 10). Lança `Error` com a mensagem do servidor. */
export async function saveThemes(savedThemes: SavedTheme[]): Promise<SavedTheme[]> {
  const res = await requireSocket().emitWithAck('preferences:update', { savedThemes })
  if (!res.ok) throw new Error(res.error)
  set({ savedThemes: res.preferences.savedThemes })
  return res.preferences.savedThemes
}

/** Tema ativo agora (atalho para quem não usa a store). */
export const currentTheme = (): ThemeConfig => get().theme
