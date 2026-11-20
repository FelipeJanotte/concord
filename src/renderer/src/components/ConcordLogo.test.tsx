// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConcordLogo } from './ConcordLogo'

afterEach(cleanup)

function drawLogo(className?: string) {
  const { container } = render(<ConcordLogo className={className} />)
  return container.querySelector('svg')!
}

describe('ConcordLogo', () => {
  it('não tem cor fixa: o anel e o centro saem da cor do texto, que vem do tema', () => {
    const svg = drawLogo()
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(svg.querySelector('path')!.getAttribute('stroke')).toBe('currentColor')
    expect(svg.querySelector('circle')!.getAttribute('class')).toContain('currentColor')
  })

  it('recebe a cor e o tamanho de quem usa', () => {
    expect(drawLogo('size-4 text-primary').getAttribute('class')).toBe('size-4 text-primary')
  })

  it('é decorativa: o nome fica no texto ou no botão ao lado', () => {
    expect(drawLogo().getAttribute('aria-hidden')).toBe('true')
  })
})
