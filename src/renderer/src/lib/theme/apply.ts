import { DEFAULT_THEME, validateTheme, type ThemeConfig } from '@shared/types'
import type { TranslucencyBridge } from '@shared/translucency'
import { deriveTokens, glassTheme, THEME_TOKENS } from './derive'

export const LOCAL_THEME_KEY = 'concord:theme'
const TRANSITION_MS = 300
const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)'

let transitionTimer: ReturnType<typeof setTimeout> | undefined

export const translucencyEnv = {
  bridge: (): TranslucencyBridge | null => (typeof window !== 'undefined' ? (window.api?.translucency ?? null) : null),
  reducedTransparency: (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_TRANSPARENCY_QUERY).matches
}

export function glassActive(theme: ThemeConfig): boolean {
  return !!theme.translucent && !!translucencyEnv.bridge()?.supported && !translucencyEnv.reducedTransparency()
}

export function applyTheme(
  theme: ThemeConfig,
  { root = globalThis.document?.documentElement, animate = true, windowEffects = true } = {}
): void {
  if (!root) return
  const glass = windowEffects && glassActive(theme)
  const derived = deriveTokens(theme)
  if (windowEffects) translucencyEnv.bridge()?.set({ glass, scheme: derived.colorScheme })
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

export function saveLocalTheme(theme: ThemeConfig): void {
  try {
    localStorage.setItem(LOCAL_THEME_KEY, JSON.stringify(theme))
  } catch {
    return
  }
}

export function loadLocalTheme(): ThemeConfig {
  try {
    const raw = localStorage.getItem(LOCAL_THEME_KEY)
    return (raw && validateTheme(JSON.parse(raw))) || DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}
