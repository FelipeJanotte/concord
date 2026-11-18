// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { thumbarIconSvg } from './thumbar-icons'

describe('thumbarIconSvg', () => {
  it('desenha cada ícone como SVG do tamanho da miniatura, na cor pedida', () => {
    const svg = thumbarIconSvg('mic', '#ffffff')
    expect(svg).toMatch(/^<svg /)
    expect(svg).toContain('width="32"')
    expect(svg).toContain('stroke="#ffffff"')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('ligado e desligado são desenhos diferentes', () => {
    expect(thumbarIconSvg('mic', 'white')).not.toBe(thumbarIconSvg('micOff', 'white'))
    expect(thumbarIconSvg('headphones', 'white')).not.toBe(thumbarIconSvg('headphonesOff', 'white'))
  })
})
