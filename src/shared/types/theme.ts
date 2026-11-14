/**
 * CONTRATO — v5 temas (A9 servidor / B11 motor / B12 editor). Proposta para revisão.
 *
 * Um tema é só a "receita": base clara/escura, cor de destaque, gradiente de fundo e
 * intensidade. As cores de cada parte da tela (sidebar, rail, painel, texto...) são
 * DERIVADAS dela no app (`deriveTokens`, B11), garantindo contraste legível.
 * `validateTheme` e o código de compartilhamento são funções puras usadas pelos dois lados:
 * o servidor só guarda tema válido e o app só aplica tema válido.
 */

export const THEME_BASES = ['escuro', 'claro'] as const
export type ThemeBase = (typeof THEME_BASES)[number]

export interface ThemeConfig {
  base: ThemeBase
  /** cor de destaque (botões, links, seleção): `#rrggbb` minúsculo */
  accent: string
  /** fundo em gradiente: 1 a 4 cores (`#rrggbb`) e o ângulo em graus (0–360) */
  background: { stops: string[]; angle: number }
  /** quanto o gradiente aparece sobre a base (0 = base lisa, 100 = gradiente cheio) */
  intensity: number
}

/** Tema salvo pela pessoa (até `SAVED_THEMES_MAX`). */
export interface SavedTheme {
  id: string
  name: string
  theme: ThemeConfig
}

export const THEME_NAME_MAX = 32
export const SAVED_THEMES_MAX = 10
export const THEME_STOPS_MAX = 4

/** O visual de hoje (escuro, azul do Discord, fundo liso). */
export const DEFAULT_THEME: ThemeConfig = {
  base: 'escuro',
  accent: '#5865f2',
  background: { stops: ['#313338'], angle: 180 },
  intensity: 0
}

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Tema válido e normalizado (cores em minúsculas, ângulo e intensidade inteiros),
 * ou null se qualquer campo estiver errado. Campos extras são descartados.
 */
export function validateTheme(raw: unknown): ThemeConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const bg = t.background as Record<string, unknown> | undefined
  if (!THEME_BASES.includes(t.base as ThemeBase)) return null
  if (typeof t.accent !== 'string' || !HEX.test(t.accent)) return null
  if (!bg || typeof bg !== 'object' || !Array.isArray(bg.stops)) return null
  const stops = bg.stops
  if (stops.length < 1 || stops.length > THEME_STOPS_MAX || !stops.every((s) => typeof s === 'string' && HEX.test(s))) {
    return null
  }
  const angle = bg.angle
  const intensity = t.intensity
  if (typeof angle !== 'number' || !Number.isFinite(angle) || angle < 0 || angle > 360) return null
  if (typeof intensity !== 'number' || !Number.isFinite(intensity) || intensity < 0 || intensity > 100) return null
  return {
    base: t.base as ThemeBase,
    accent: t.accent.toLowerCase(),
    background: { stops: (stops as string[]).map((s) => s.toLowerCase()), angle: Math.round(angle) },
    intensity: Math.round(intensity)
  }
}

/** Nome de tema salvo: sem caracteres de controle, espaços colapsados, 1–32 caracteres; null se inválido. */
export function cleanThemeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ')
  return name.length >= 1 && name.length <= THEME_NAME_MAX ? name : null
}

const CODE_PREFIX = 'concord-tema:'

/** Código curto para compartilhar um tema com amigos (copiar e colar). */
export function encodeThemeCode(theme: ThemeConfig): string {
  const compact = [theme.base === 'claro' ? 1 : 0, theme.accent.slice(1), theme.background.stops.map((s) => s.slice(1)).join('.'), theme.background.angle, theme.intensity]
  return CODE_PREFIX + compact.join('~')
}

/** Lê um código de tema (aceita espaços em volta); null se não for um código válido. */
export function decodeThemeCode(code: unknown): ThemeConfig | null {
  if (typeof code !== 'string') return null
  const text = code.trim()
  if (!text.startsWith(CODE_PREFIX)) return null
  const parts = text.slice(CODE_PREFIX.length).split('~')
  if (parts.length !== 5) return null
  const [base, accent, stops, angle, intensity] = parts
  if (base !== '0' && base !== '1') return null
  if (!/^\d+$/.test(angle) || !/^\d+$/.test(intensity)) return null
  return validateTheme({
    base: base === '1' ? 'claro' : 'escuro',
    accent: `#${accent}`,
    background: { stops: stops.split('.').map((s) => `#${s}`), angle: Number(angle) },
    intensity: Number(intensity)
  })
}
