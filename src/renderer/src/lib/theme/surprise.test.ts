// "Surpreenda-me": tema sorteado sempre válido, legível, que combina com a base e diferente do atual.
import { describe, expect, it } from 'vitest'
import { validateTheme, type ThemeConfig } from '@shared/types'
import { contrast, luminance } from './color'
import { deriveTokens, glassTheme, GLASS_OPACITY, withAlpha } from './derive'
import { sameTheme } from './editor'
import { THEME_PRESETS } from './presets'
import { hslToHex, surpriseTheme } from './surprise'

/** Sequência fixa (para o teste não depender da sorte). */
function seeded(seed: number): () => number {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

describe('hslToHex', () => {
  it('converte as cores básicas', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000')
    expect(hslToHex(120, 1, 0.5)).toBe('#00ff00')
    expect(hslToHex(240, 1, 0.5)).toBe('#0000ff')
    expect(hslToHex(0, 0, 1)).toBe('#ffffff')
    expect(hslToHex(-120, 1, 0.5)).toBe('#0000ff') // matiz negativo dá a volta
  })
})

describe('surpriseTheme', () => {
  it('300 sorteios: sempre válidos, com gradiente de 2–3 cores, intensidade visível e fundo que combina com a base', () => {
    const random = seeded(7)
    for (let i = 0; i < 300; i++) {
      const t = surpriseTheme(random)
      expect(validateTheme(t)).toEqual(t)
      expect(t.background.stops.length).toBeGreaterThanOrEqual(2)
      expect(t.background.stops.length).toBeLessThanOrEqual(3)
      expect(t.intensity).toBeGreaterThanOrEqual(45)
      expect(t.background.angle % 15).toBe(0)
      for (const stop of t.background.stops) {
        if (t.base === 'escuro') expect(luminance(stop)).toBeLessThan(0.16)
        else expect(luminance(stop)).toBeGreaterThan(0.5)
      }
      // o motor garante o texto legível em cima do resultado
      const { tokens } = deriveTokens(t)
      expect(contrast(tokens.foreground, tokens.background)).toBeGreaterThanOrEqual(4.5)
      expect(t).not.toHaveProperty('translucent')
    }
  })

  it('sorteia dos dois tipos de base', () => {
    const random = seeded(3)
    const bases = new Set(Array.from({ length: 60 }, () => surpriseTheme(random).base))
    expect(bases).toEqual(new Set(['escuro', 'claro']))
  })

  it('nunca devolve o tema atual e mantém o vidro dele', () => {
    const current: ThemeConfig = { ...THEME_PRESETS.find((p) => p.id === 'vidro')!.theme }
    let calls = 0
    const random = seeded(11)
    const next = surpriseTheme(() => (calls++, random()), current)
    expect(sameTheme(next, current)).toBe(false)
    expect(next.translucent).toBe(true)
  })
})

describe('vidro no motor', () => {
  it('withAlpha acrescenta a opacidade em hex', () => {
    expect(withAlpha('#112233', 1)).toBe('#112233ff')
    expect(withAlpha('#112233', 0)).toBe('#11223300')
    expect(withAlpha('#112233', 0.5)).toBe('#11223380')
  })

  it('glassTheme deixa as superfícies semitransparentes; bordas, destaque e textos ficam opacos', () => {
    const theme = THEME_PRESETS.find((p) => p.id === 'vidro')!.theme
    const opaque = deriveTokens(theme)
    const glass = glassTheme(opaque)
    for (const [token, opacity] of Object.entries(GLASS_OPACITY)) {
      expect(glass.tokens[token as keyof typeof glass.tokens]).toBe(withAlpha(opaque.tokens[token as keyof typeof opaque.tokens], opacity!))
    }
    for (const token of ['border', 'primary', 'foreground', 'popover-foreground'] as const) expect(glass.tokens[token]).toBe(opaque.tokens[token])
    expect(glass.gradient).toContain('150deg')
    expect(glass.gradientStops.every((s) => s.length === 9)).toBe(true)
  })

  it('camadas do liquid glass: o que flutua (menus, janelas) é mais opaco que as superfícies da janela', () => {
    const { popover, ...windowSurfaces } = GLASS_OPACITY
    for (const opacity of Object.values(windowSurfaces)) expect(opacity!).toBeLessThan(popover!)
    expect(popover!).toBeGreaterThanOrEqual(0.8)
    expect(GLASS_OPACITY.rail!).toBeLessThanOrEqual(0.4)
  })

  it('temas prontos translúcidos existem (escuro e claro)', () => {
    const glass = THEME_PRESETS.filter((p) => p.theme.translucent)
    expect(glass.map((p) => p.theme.base).sort()).toEqual(['claro', 'escuro'])
  })
})
