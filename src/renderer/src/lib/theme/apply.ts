/**
 * Aplica um tema na tela: escreve os tokens derivados como variáveis CSS no `:root` (com uma transição curta)
 * e guarda o tema na máquina, para o app abrir já com ele antes do login (`loadLocalTheme`).
 * Tema translúcido (vidro): onde o sistema tem o efeito, pede o material à janela (`window.api.translucency`)
 * e deixa as superfícies semitransparentes (`glassTheme`); onde não tem, aplica o tema opaco.
 */
import { DEFAULT_THEME, validateTheme, type ThemeConfig } from '@shared/types'
import type { TranslucencyBridge } from '@shared/translucency'
import { deriveTokens, glassTheme, THEME_TOKENS } from './derive'

export const LOCAL_THEME_KEY = 'concord:theme'
const TRANSITION_MS = 300

let transitionTimer: ReturnType<typeof setTimeout> | undefined

/** A ponte do vidro (só na janela principal do Electron); os testes trocam. */
export const translucencyEnv = {
  bridge: (): TranslucencyBridge | null => (typeof window !== 'undefined' ? (window.api?.translucency ?? null) : null)
}

/** O vidro vale agora? Tema translúcido e sistema com o efeito. */
export function glassActive(theme: ThemeConfig): boolean {
  return !!theme.translucent && !!translucencyEnv.bridge()?.supported
}

/**
 * Escreve os tokens do tema no elemento (padrão: `<html>`). `animate` liga a transição de cores.
 * `windowEffects: false` = não mexe no vidro da janela (página do overlay em jogos, que já é transparente).
 */
export function applyTheme(
  theme: ThemeConfig,
  { root = globalThis.document?.documentElement, animate = true, windowEffects = true } = {}
): void {
  if (!root) return // sem tela (testes em node): nada a aplicar
  const glass = windowEffects && glassActive(theme)
  if (windowEffects) translucencyEnv.bridge()?.set(glass)
  const derived = deriveTokens(theme)
  const { tokens, gradient, colorScheme } = glass ? glassTheme(derived) : derived
  if (animate) {
    root.classList.add('theme-transition')
    clearTimeout(transitionTimer)
    transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS)
  }
  for (const token of THEME_TOKENS) root.style.setProperty(`--${token}`, tokens[token])
  root.style.setProperty('--app-gradient', gradient)
  root.style.colorScheme = colorScheme
  root.dataset.themeBase = theme.base
  if (glass) root.dataset.translucent = 'true'
  else delete root.dataset.translucent
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
