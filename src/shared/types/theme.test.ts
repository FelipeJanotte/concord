import { describe, expect, it } from 'vitest'
import {
  cleanThemeName,
  decodeThemeCode,
  DEFAULT_THEME,
  encodeThemeCode,
  validateTheme,
  type ThemeConfig
} from './theme'

const aurora: ThemeConfig = {
  base: 'escuro',
  accent: '#7c3aed',
  background: { stops: ['#0f172a', '#4c1d95', '#0ea5e9'], angle: 135 },
  intensity: 60
}

describe('validateTheme', () => {
  it('aceita tema válido e normaliza (cores minúsculas, números inteiros, sem campos extras)', () => {
    expect(validateTheme(aurora)).toEqual(aurora)
    expect(
      validateTheme({ ...aurora, accent: '#7C3AED', background: { stops: ['#0F172A'], angle: 90.4 }, intensity: 49.6, extra: 1 })
    ).toEqual({ base: 'escuro', accent: '#7c3aed', background: { stops: ['#0f172a'], angle: 90 }, intensity: 50 })
    expect(validateTheme(DEFAULT_THEME)).toEqual(DEFAULT_THEME)
  })

  it.each([
    ['base desconhecida', { ...aurora, base: 'neon' }],
    ['cor de destaque inválida', { ...aurora, accent: 'roxo' }],
    ['cor curta', { ...aurora, accent: '#fff' }],
    ['sem cores no gradiente', { ...aurora, background: { stops: [], angle: 0 } }],
    ['cores demais', { ...aurora, background: { stops: ['#000000', '#111111', '#222222', '#333333', '#444444'], angle: 0 } }],
    ['cor inválida no gradiente', { ...aurora, background: { stops: ['#000000', 'url(x)'], angle: 0 } }],
    ['ângulo fora de 0–360', { ...aurora, background: { stops: ['#000000'], angle: 361 } }],
    ['intensidade negativa', { ...aurora, intensity: -1 }],
    ['intensidade NaN', { ...aurora, intensity: Number.NaN }],
    ['sem fundo', { base: 'escuro', accent: '#000000', intensity: 0 }],
    ['nulo', null],
    ['texto', 'tema']
  ])('recusa %s', (_label, raw) => {
    expect(validateTheme(raw)).toBeNull()
  })
})

describe('cleanThemeName', () => {
  it('limpa espaços e caracteres de controle; 1–32', () => {
    expect(cleanThemeName('  Meu   tema \n')).toBe('Meu tema')
    expect(cleanThemeName('')).toBeNull()
    expect(cleanThemeName('x'.repeat(33))).toBeNull()
    expect(cleanThemeName(42)).toBeNull()
  })
})

describe('código de compartilhamento', () => {
  it('ida e volta dá o mesmo tema', () => {
    const code = encodeThemeCode(aurora)
    expect(code).toBe('concord-tema:0~7c3aed~0f172a.4c1d95.0ea5e9~135~60')
    expect(decodeThemeCode(code)).toEqual(aurora)
    expect(decodeThemeCode(`  ${encodeThemeCode({ ...DEFAULT_THEME, base: 'claro' })}\n`)).toEqual({ ...DEFAULT_THEME, base: 'claro' })
  })

  it.each([
    ['sem prefixo', '0~7c3aed~0f172a~135~60'],
    ['partes faltando', 'concord-tema:0~7c3aed~0f172a~135'],
    ['base inválida', 'concord-tema:2~7c3aed~0f172a~135~60'],
    ['cor inválida', 'concord-tema:0~zzzzzz~0f172a~135~60'],
    ['ângulo não numérico', 'concord-tema:0~7c3aed~0f172a~abc~60'],
    ['intensidade fora', 'concord-tema:0~7c3aed~0f172a~135~200'],
    ['não é texto', 123]
  ])('recusa %s', (_label, code) => {
    expect(decodeThemeCode(code)).toBeNull()
  })
})

describe('tema translúcido (vidro)', () => {
  const base = { base: 'escuro', accent: '#7aa2ff', background: { stops: ['#1b2440'], angle: 150 }, intensity: 45 }

  it('validateTheme guarda `translucent` só quando é true (false ou lixo somem: opaco)', () => {
    expect(validateTheme({ ...base, translucent: true })).toMatchObject({ translucent: true })
    expect(validateTheme({ ...base, translucent: false })).not.toHaveProperty('translucent')
    expect(validateTheme({ ...base, translucent: 'sim' })).not.toHaveProperty('translucent')
    expect(validateTheme(base)).not.toHaveProperty('translucent')
  })

  it('código: o vidro vira um "~1" no fim; códigos antigos (sem ele) continuam valendo; outro valor é inválido', () => {
    const glass = validateTheme({ ...base, translucent: true })!
    const code = encodeThemeCode(glass)
    expect(code.endsWith('~1')).toBe(true)
    expect(decodeThemeCode(code)).toEqual(glass)
    const opaque = validateTheme(base)!
    expect(encodeThemeCode(opaque).split('~')).toHaveLength(5)
    expect(decodeThemeCode(encodeThemeCode(opaque))).toEqual(opaque)
    expect(decodeThemeCode(code.replace(/~1$/, '~2'))).toBeNull()
  })
})
