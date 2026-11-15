/**
 * Aplica um tema na tela: escreve os tokens derivados como variáveis CSS no `:root` (com uma transição curta)
 * e guarda o tema na máquina, para o app abrir já com ele antes do login (`loadLocalTheme`).
 */
import { DEFAULT_THEME, validateTheme, type ThemeConfig } from '@shared/types'
import { deriveTokens, THEME_TOKENS } from './derive'

export const LOCAL_THEME_KEY = 'concord:theme'
const TRANSITION_MS = 300

let transitionTimer: ReturnType<typeof setTimeout> | undefined

/** Escreve os tokens do tema no elemento (padrão: `<html>`). `animate` liga a transição de cores. */
export function applyTheme(theme: ThemeConfig, { root = globalThis.document?.documentElement, animate = true } = {}): void {
  if (!root) return // sem tela (testes em node): nada a aplicar
  const { tokens, gradient, colorScheme } = deriveTokens(theme)
  if (animate) {
    root.classList.add('theme-transition')
    clearTimeout(transitionTimer)
    transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS)
  }
  for (const token of THEME_TOKENS) root.style.setProperty(`--${token}`, tokens[token])
  root.style.setProperty('--app-gradient', gradient)
  root.style.colorScheme = colorScheme
  root.dataset.themeBase = theme.base
}

/** Guarda o tema na máquina (o último usado abre antes do login). Sem armazenamento: ignora. */
export function saveLocalTheme(theme: ThemeConfig): void {
  try {
    localStorage.setItem(LOCAL_THEME_KEY, JSON.stringify(theme))
  } catch {
    // modo privado/armazenamento cheio: só não lembra
  }
}

/** O último tema usado nesta máquina (válido), ou o padrão. */
export function loadLocalTheme(): ThemeConfig {
  try {
    const raw = localStorage.getItem(LOCAL_THEME_KEY)
    return (raw && validateTheme(JSON.parse(raw))) || DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}
