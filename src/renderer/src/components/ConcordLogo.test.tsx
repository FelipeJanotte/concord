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
  it('não tem cor fixa: anel e centro vêm dos tokens logo e logo-core do tema', () => {
    const svg = drawLogo()
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(svg.querySelector('path')!.getAttribute('class')).toBe('stroke-logo')
    expect(svg.querySelector('circle')!.getAttribute('class')).toBe('fill-logo-core')
  })

  it('recebe o tamanho de quem usa', () => {
    expect(drawLogo('size-4').getAttribute('class')).toBe('size-4')
  })

  it('é decorativa: o nome fica no texto ou no botão ao lado', () => {
    expect(drawLogo().getAttribute('aria-hidden')).toBe('true')
  })
})
