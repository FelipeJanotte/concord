// Cores do motor de temas: conversões, mistura, luminância e contraste (valores de referência do WCAG).
import { describe, expect, it } from 'vitest'
import { average, contrast, ensureContrast, hexToRgb, luminance, mix, readableOn, rgbToHex } from './color'

describe('cores', () => {
  it('hex ↔ rgb, com arredondamento e limite', () => {
    expect(hexToRgb('#5865f2')).toEqual([88, 101, 242])
    expect(rgbToHex([88, 101, 242])).toBe('#5865f2')
    expect(rgbToHex([300, -5, 127.6])).toBe('#ff0080')
  })

  it('mix nas pontas devolve as cores; no meio, a média', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#FFFFFF', 1)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(average(['#ff0000', '#0000ff'])).toBe('#800080')
    expect(average(['#123456'])).toBe('#123456')
  })

  it('luminância e contraste batem com os valores do WCAG', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
    expect(luminance('#000000')).toBe(0)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrast('#ffffff', '#777777')).toBe(contrast('#777777', '#ffffff'))
  })

  it('ensureContrast só mexe quando precisa e atende todas as superfícies', () => {
    expect(ensureContrast('#dbdee1', ['#313338'], '#ffffff')).toBe('#dbdee1')
    const fixed = ensureContrast('#666666', ['#555555', '#444444'], '#ffffff')
    expect(contrast(fixed, '#555555')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(fixed, '#444444')).toBeGreaterThanOrEqual(4.5)
    // impossível chegar lá: devolve o extremo
    expect(ensureContrast('#808080', ['#ffffff', '#000000'], '#ffffff')).toBe('#ffffff')
  })

  it('readableOn escolhe branco ou preto pelo contraste', () => {
    expect(readableOn('#5865f2')).toBe('#ffffff')
    expect(readableOn('#ffd43b')).toBe('#000000')
  })
})
