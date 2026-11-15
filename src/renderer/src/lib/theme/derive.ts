/**
 * Motor de temas (v5, B11): do `ThemeConfig` (a receita) para os tokens de cor do app (`assets/globals.css`).
 *
 * - Cada base (escuro/claro) tem a sua paleta. A escura é exatamente a de hoje: o `DEFAULT_THEME` (intensidade 0,
 *   azul do Discord) reproduz o visual atual.
 * - O gradiente tinge as superfícies na proporção da `intensity` (o tom é a média das cores) e aparece de verdade no
 *   fundo principal (`--app-gradient`, usado por `.bg-background`).
 * - Contraste garantido: texto (normal e secundário) com pelo menos AA (4,5:1) sobre todas as superfícies em que
 *   aparece, inclusive cada cor do gradiente; o texto sobre a cor de destaque é branco ou preto, o que ler melhor.
 */
import type { ThemeBase, ThemeConfig } from '@shared/types'
import { average, contrast, ensureContrast, mix, readableOn } from './color'

/** Tokens de cor que o tema controla (os nomes das variáveis CSS, sem `--`). */
export const THEME_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'rail',
  'panel',
  'composer',
  'success'
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]

export interface DerivedTheme {
  tokens: Record<ThemeToken, string>
  /** `linear-gradient(...)` do fundo principal, ou `none` com intensidade 0 */
  gradient: string
  /** as cores do gradiente já misturadas com a base (onde o texto do chat aparece) */
  gradientStops: string[]
  colorScheme: 'dark' | 'light'
}

type Palette = Omit<Record<ThemeToken, string>, 'primary' | 'primary-foreground' | 'ring'>

/** A paleta escura de hoje (igual a `assets/globals.css`). */
const DARK: Palette = {
  background: '#313338',
  foreground: '#dbdee1',
  card: '#2b2d31',
  'card-foreground': '#dbdee1',
  popover: '#111214',
  'popover-foreground': '#dbdee1',
  secondary: '#4e5058',
  'secondary-foreground': '#ffffff',
  muted: '#2b2d31',
  'muted-foreground': '#949ba4',
  accent: '#404249',
  'accent-foreground': '#f2f3f5',
  destructive: '#da373c',
  border: '#3f4147',
  input: '#1e1f22',
  sidebar: '#2b2d31',
  'sidebar-foreground': '#949ba4',
  rail: '#1e1f22',
  panel: '#232428',
  composer: '#383a40',
  success: '#23a55a'
}

const LIGHT: Palette = {
  background: '#ffffff',
  foreground: '#313338',
  card: '#f2f3f5',
  'card-foreground': '#313338',
  popover: '#ffffff',
  'popover-foreground': '#313338',
  secondary: '#e3e5e8',
  'secondary-foreground': '#313338',
  muted: '#f2f3f5',
  'muted-foreground': '#5c5e66',
  accent: '#e0e1e5',
  'accent-foreground': '#060607',
  destructive: '#da373c',
  border: '#e1e2e4',
  input: '#e3e5e8',
  sidebar: '#f2f3f5',
  'sidebar-foreground': '#5c5e66',
  rail: '#e3e5e8',
  panel: '#ebedef',
  composer: '#ebedef',
  success: '#1f8b4c'
}

const PALETTES: Record<ThemeBase, Palette> = { escuro: DARK, claro: LIGHT }

/** Quanto cada superfície puxa o tom do gradiente com intensidade 100 (o resto continua sendo a base). */
const TINT: Partial<Record<ThemeToken, number>> = {
  background: 0.3,
  card: 0.28,
  muted: 0.28,
  sidebar: 0.28,
  panel: 0.26,
  rail: 0.24,
  composer: 0.22,
  secondary: 0.2,
  accent: 0.22,
  border: 0.25,
  input: 0.2,
  popover: 0.15
}

/** Quanto o gradiente aparece no fundo principal com intensidade 100. */
const GRADIENT_STRENGTH = 0.55

/**
 * Contraste mínimo entre uma superfície e o extremo do texto (branco no escuro, preto no claro). Com 7:1 sobra
 * espaço para o texto normal e o secundário (que é mais apagado) passarem de 4,5:1.
 */
const SURFACE_HEADROOM = 7

/** Superfície tingida que ficou clara (ou escura) demais para o texto: puxada de volta para o lado da base. */
function keepHeadroom(color: string, textExtreme: string, away: string): string {
  if (contrast(color, textExtreme) >= SURFACE_HEADROOM) return color
  for (let t = 0.05; t < 1; t += 0.05) {
    const candidate = mix(color, away, t)
    if (contrast(candidate, textExtreme) >= SURFACE_HEADROOM) return candidate
  }
  return away
}

export function deriveTokens(theme: ThemeConfig): DerivedTheme {
  const base = PALETTES[theme.base]
  const k = theme.intensity / 100
  const tone = average(theme.background.stops)
  const toward = theme.base === 'escuro' ? '#ffffff' : '#000000'
  const away = theme.base === 'escuro' ? '#000000' : '#ffffff'

  const surface = (token: keyof Palette): string => {
    const tint = TINT[token]
    return tint ? keepHeadroom(mix(base[token], tone, tint * k), toward, away) : base[token]
  }
  const t = {} as Record<ThemeToken, string>
  for (const token of Object.keys(base) as (keyof Palette)[]) t[token] = surface(token)

  // fundo principal: o gradiente misturado com a base (texto do chat aparece por cima de cada cor dele)
  const gradientStops =
    k === 0 ? [] : theme.background.stops.map((s) => keepHeadroom(mix(base.background, s, GRADIENT_STRENGTH * k), toward, away))
  const chatSurfaces = [t.background, ...gradientStops]

  // textos: AA sobre todas as superfícies em que aparecem
  t.foreground = ensureContrast(base.foreground, [...chatSurfaces, t.composer, t.panel, t.secondary], toward)
  t['muted-foreground'] = ensureContrast(base['muted-foreground'], [...chatSurfaces, t.card, t.muted], toward)
  t['sidebar-foreground'] = ensureContrast(base['sidebar-foreground'], [t.sidebar, t.panel], toward)
  t['card-foreground'] = ensureContrast(base['card-foreground'], [t.card], toward)
  t['popover-foreground'] = ensureContrast(base['popover-foreground'], [t.popover], toward)
  t['secondary-foreground'] = ensureContrast(base['secondary-foreground'], [t.secondary], toward)
  t['accent-foreground'] = ensureContrast(base['accent-foreground'], [t.accent], toward)

  t.primary = theme.accent
  t.ring = theme.accent
  t['primary-foreground'] = readableOn(theme.accent)

  const gradient =
    gradientStops.length === 0
      ? 'none'
      : gradientStops.length === 1
        ? `linear-gradient(${theme.background.angle}deg, ${gradientStops[0]}, ${gradientStops[0]})`
        : `linear-gradient(${theme.background.angle}deg, ${gradientStops.join(', ')})`

  return { tokens: t, gradient, gradientStops, colorScheme: theme.base === 'escuro' ? 'dark' : 'light' }
}

/**
 * Tema translúcido (vidro): quanto de cada superfície continua pintado (0–1); o resto deixa ver o material
 * do sistema (área de trabalho desfocada) atrás da janela. Menus (`popover`), campos (`input`), bordas e a
 * cor de destaque ficam opacos: é onde a leitura não pode depender do que está atrás. Os valores altos
 * mantêm o contraste do texto perto do calculado para a superfície opaca (o vidro do sistema já escurece
 * ou clareia o fundo).
 */
export const GLASS_OPACITY: Partial<Record<ThemeToken, number>> = {
  rail: 0.55,
  sidebar: 0.62,
  panel: 0.7,
  background: 0.72,
  card: 0.8,
  muted: 0.8,
  composer: 0.82,
  secondary: 0.85
}

/** `#rrggbb` + opacidade → `#rrggbbaa`. */
export function withAlpha(hex: string, opacity: number): string {
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
  return hex.slice(0, 7) + a.toString(16).padStart(2, '0')
}

/** O mesmo tema com as superfícies semitransparentes (vidro), inclusive as cores do gradiente. */
export function glassTheme(derived: DerivedTheme): DerivedTheme {
  const tokens = { ...derived.tokens }
  for (const [token, opacity] of Object.entries(GLASS_OPACITY) as [ThemeToken, number][]) tokens[token] = withAlpha(tokens[token], opacity)
  const stops = derived.gradientStops.map((s) => withAlpha(s, GLASS_OPACITY.background!))
  const gradient =
    stops.length === 0 ? 'none' : `linear-gradient(${derived.gradient.match(/\((\d+)deg/)?.[1] ?? 180}deg, ${(stops.length === 1 ? [stops[0], stops[0]] : stops).join(', ')})`
  return { ...derived, tokens, gradient, gradientStops: stops }
}
