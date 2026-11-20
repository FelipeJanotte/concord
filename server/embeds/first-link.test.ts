import { describe, expect, it } from 'vitest'
import { firstPreviewLink } from './first-link'

describe('firstPreviewLink', () => {
  it('devolve o primeiro link http(s) do texto', () => {
    expect(firstPreviewLink('olha https://a.com/x e https://b.com')).toBe('https://a.com/x')
  })

  it('www. vira https', () => {
    expect(firstPreviewLink('vai em www.exemplo.com.br.')).toBe('https://www.exemplo.com.br/')
  })

  it('sem link: null', () => {
    expect(firstPreviewLink('só texto')).toBeNull()
    expect(firstPreviewLink('')).toBeNull()
  })

  it('ignora link em código e em spoiler', () => {
    expect(firstPreviewLink('`https://codigo.com` depois https://valendo.com')).toBe('https://valendo.com/')
    expect(firstPreviewLink('```\nhttps://bloco.com\n```\nhttps://fora.com')).toBe('https://fora.com/')
    expect(firstPreviewLink('||https://segredo.com||')).toBeNull()
  })

  it('acha link em negrito e em citação', () => {
    expect(firstPreviewLink('**https://forte.com**')).toBe('https://forte.com/')
    expect(firstPreviewLink('> https://citado.com')).toBe('https://citado.com/')
  })
})
