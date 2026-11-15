// Editor de temas (v5, B12): operações puras sobre o ThemeConfig e a lista de temas salvos.
import {
  cleanThemeName,
  SAVED_THEMES_MAX,
  THEME_NAME_MAX,
  THEME_STOPS_MAX,
  type SavedTheme,
  type ThemeConfig
} from '@shared/types'
import { THEME_PRESETS, type ThemePreset } from './presets'

/** Mais uma cor no gradiente (repete a última; no máximo 4). */
export function addStop(theme: ThemeConfig): ThemeConfig {
  const stops = theme.background.stops
  if (stops.length >= THEME_STOPS_MAX) return theme
  return { ...theme, background: { ...theme.background, stops: [...stops, stops[stops.length - 1]] } }
}

/** Tira a cor `index` do gradiente (fica sempre pelo menos uma). */
export function removeStop(theme: ThemeConfig, index: number): ThemeConfig {
  const stops = theme.background.stops
  if (stops.length <= 1 || index < 0 || index >= stops.length) return theme
  return { ...theme, background: { ...theme.background, stops: stops.filter((_, i) => i !== index) } }
}

export function setStop(theme: ThemeConfig, index: number, color: string): ThemeConfig {
  const stops = theme.background.stops.map((s, i) => (i === index ? color.toLowerCase() : s))
  return { ...theme, background: { ...theme.background, stops } }
}

export function sameTheme(a: ThemeConfig, b: ThemeConfig): boolean {
  return (
    a.base === b.base &&
    a.accent === b.accent &&
    a.intensity === b.intensity &&
    a.background.angle === b.background.angle &&
    a.background.stops.length === b.background.stops.length &&
    a.background.stops.every((s, i) => s === b.background.stops[i]) &&
    !!a.translucent === !!b.translucent
  )
}

/** O tema pronto igual a este (para marcar na galeria), se houver. */
export function matchingPreset(theme: ThemeConfig): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => sameTheme(p.theme, theme))
}

/** "Oceano" → "Oceano (cópia)", cortando o nome para caber em 32 caracteres. */
export function copyName(name: string): string {
  const suffix = ' (cópia)'
  return name.slice(0, THEME_NAME_MAX - suffix.length).trimEnd() + suffix
}

/**
 * A lista com um tema novo no fim. Erros (texto) para a tela: nome inválido ou lista cheia.
 * `id` é injetável para os testes.
 */
export function addSavedTheme(
  list: SavedTheme[],
  name: string,
  theme: ThemeConfig,
  id: string = crypto.randomUUID()
): SavedTheme[] | string {
  const clean = cleanThemeName(name)
  if (!clean) return `Dê um nome de 1 a ${THEME_NAME_MAX} caracteres`
  if (list.length >= SAVED_THEMES_MAX) return `Você pode salvar até ${SAVED_THEMES_MAX} temas. Apague um antes.`
  return [...list, { id, name: clean, theme }]
}

export function removeSavedTheme(list: SavedTheme[], id: string): SavedTheme[] {
  return list.filter((t) => t.id !== id)
}
