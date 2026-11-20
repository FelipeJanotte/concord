// Motor de temas: o padrão reproduz o visual de hoje, os prontos são válidos e QUALQUER tema tem texto legível (AA).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, validateTheme, type ThemeConfig } from '@shared/types'
import { AA, contrast, NON_TEXT } from './color'
import { deriveTokens, THEME_TOKENS, type DerivedTheme } from './derive'
import { THEME_PRESETS } from './presets'

/** Os valores de `:root` em assets/globals.css (o visual de antes dos temas). */
function cssRootTokens(): Record<string, string> {
  const css = readFileSync(join(__dirname, '../../assets/globals.css'), 'utf8')
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  const out: Record<string, string> = {}
  for (const m of root.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)) out[m[1]] = m[2].toLowerCase()
  return out
}

/** Os pares texto × superfície que precisam de AA. */
function textPairs({ tokens: t, gradientStops }: DerivedTheme): Array<[string, string, string]> {
  const chat = [t.background, ...gradientStops]
  return [
    ...chat.flatMap((bg) => [
      ['foreground', t.foreground, bg] as [string, string, string],
      ['muted-foreground', t['muted-foreground'], bg] as [string, string, string]
    ]),
    ['foreground/composer', t.foreground, t.composer],
    ['foreground/panel', t.foreground, t.panel],
    ['muted/card', t['muted-foreground'], t.card],
    ['sidebar-foreground/sidebar', t['sidebar-foreground'], t.sidebar],
    ['sidebar-foreground/panel', t['sidebar-foreground'], t.panel],
    ['card-foreground/card', t['card-foreground'], t.card],
    ['popover-foreground/popover', t['popover-foreground'], t.popover],
    ['secondary-foreground/secondary', t['secondary-foreground'], t.secondary],
    ['accent-foreground/accent', t['accent-foreground'], t.accent]
  ]
}

function expectReadable(theme: ThemeConfig): void {
  const derived = deriveTokens(theme)
  for (const [name, fg, bg] of textPairs(derived)) {
    expect(contrast(fg, bg), `${name} ${fg} sobre ${bg} (${JSON.stringify(theme)})`).toBeGreaterThanOrEqual(AA)
  }
  // texto sobre a cor de destaque: o melhor entre branco e preto (sempre pelo menos 4,5 com um dos dois)
  const onAccent = contrast(derived.tokens['primary-foreground'], theme.accent)
  expect(onAccent).toBeGreaterThanOrEqual(Math.max(contrast('#ffffff', theme.accent), contrast('#000000', theme.accent)) - 1e-9)
  expectLogoVisible(derived, theme)
}

function expectLogoVisible({ tokens: t, gradientStops }: DerivedTheme, theme: ThemeConfig): void {
  for (const bg of [t.rail, t.sidebar, t.accent, t.background, ...gradientStops]) {
    for (const part of ['logo', 'logo-core'] as const) {
      expect(contrast(t[part], bg), `${part} ${t[part]} sobre ${bg} (${JSON.stringify(theme)})`).toBeGreaterThanOrEqual(NON_TEXT)
    }
  }
}

/** Gerador com semente (mulberry32), para os temas aleatórios serem sempre os mesmos. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const randomHex = (r: () => number): string =>
  '#' + Math.floor(r() * 0x1000000).toString(16).padStart(6, '0')

describe('deriveTokens', () => {
  it('o tema padrão reproduz exatamente as cores de assets/globals.css (o visual de hoje)', () => {
    const { tokens, gradient, colorScheme } = deriveTokens(DEFAULT_THEME)
    const css = cssRootTokens()
    for (const token of THEME_TOKENS) expect(tokens[token], token).toBe(css[token])
    expect(gradient).toBe('none')
    expect(colorScheme).toBe('dark')
  })

  it('intensidade 0 não tinge nada; com intensidade, as superfícies puxam o tom do gradiente e aparece o gradiente', () => {
    const flat = deriveTokens({ ...DEFAULT_THEME, background: { stops: ['#ff0000'], angle: 90 }, intensity: 0 })
    expect(flat.tokens.background).toBe('#313338')
    const tinted = deriveTokens({ ...DEFAULT_THEME, background: { stops: ['#ff0000', '#0000ff'], angle: 90 }, intensity: 100 })
    expect(tinted.tokens.background).not.toBe('#313338')
    expect(tinted.gradient).toMatch(/^linear-gradient\(90deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/)
    expect(tinted.gradientStops).toHaveLength(2)
    expect(deriveTokens({ ...DEFAULT_THEME, background: { stops: ['#00ff00'], angle: 45 }, intensity: 50 }).gradient).toMatch(
      /^linear-gradient\(45deg, (#[0-9a-f]{6}), \1\)$/
    )
  })

  it('base clara: esquema claro e texto escuro', () => {
    const light = deriveTokens({ base: 'claro', accent: '#5865f2', background: { stops: ['#ffffff'], angle: 0 }, intensity: 0 })
    expect(light.colorScheme).toBe('light')
    expect(light.tokens.background).toBe('#ffffff')
    expect(contrast(light.tokens.foreground, '#000000')).toBeLessThan(contrast(light.tokens.foreground, '#ffffff'))
  })

  it('a cor de destaque vira primary/ring, com texto legível em cima', () => {
    const yellow = deriveTokens({ ...DEFAULT_THEME, accent: '#ffd43b' })
    expect(yellow.tokens.primary).toBe('#ffd43b')
    expect(yellow.tokens.ring).toBe('#ffd43b')
    expect(yellow.tokens['primary-foreground']).toBe('#000000')
  })

  it('a logo usa a cor de destaque e só muda quando ela sumiria no fundo', () => {
    expect(deriveTokens({ ...DEFAULT_THEME, accent: '#ffd43b' }).tokens.logo).toBe('#ffd43b')
    const darkOnDark = deriveTokens({ ...DEFAULT_THEME, accent: '#202030' }).tokens
    expect(darkOnDark.logo).not.toBe('#202030')
    expect(contrast(darkOnDark.logo, darkOnDark.rail)).toBeGreaterThanOrEqual(NON_TEXT)
  })

  it('o centro da logo é mais claro que o anel no tema escuro e mais escuro no claro', () => {
    const dark = deriveTokens(DEFAULT_THEME).tokens
    const light = deriveTokens({ base: 'claro', accent: '#5865f2', background: { stops: ['#ffffff'], angle: 0 }, intensity: 0 }).tokens
    expect(contrast(dark['logo-core'], '#ffffff')).toBeLessThan(contrast(dark.logo, '#ffffff'))
    expect(contrast(light['logo-core'], '#000000')).toBeLessThan(contrast(light.logo, '#000000'))
  })
})

describe('legibilidade (WCAG AA)', () => {
  it('todos os temas prontos são válidos, têm id único e texto legível', () => {
    expect(new Set(THEME_PRESETS.map((p) => p.id)).size).toBe(THEME_PRESETS.length)
    for (const preset of THEME_PRESETS) {
      expect(validateTheme(preset.theme), preset.name).toEqual(preset.theme)
      expectReadable(preset.theme)
    }
  })

  it('500 temas aleatórios (cores, base, ângulo e intensidade quaisquer) continuam legíveis', () => {
    const r = seeded(2026)
    for (let i = 0; i < 500; i++) {
      const stops = Array.from({ length: 1 + Math.floor(r() * 4) }, () => randomHex(r))
      expectReadable({
        base: r() < 0.5 ? 'escuro' : 'claro',
        accent: randomHex(r),
        background: { stops, angle: Math.floor(r() * 361) },
        intensity: Math.floor(r() * 101)
      })
    }
  })
})
