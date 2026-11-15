import { describe, expect, it } from 'vitest'
import { externalUrl, splitLinks } from './links'

describe('splitLinks', () => {
  it('texto sem link fica inteiro', () => {
    expect(splitLinks('oi, tudo bem?')).toEqual([{ text: 'oi, tudo bem?' }])
    expect(splitLinks('')).toEqual([])
  })

  it('acha http e https no meio do texto', () => {
    expect(splitLinks('veja https://exemplo.com/a?b=1#c e http://x.org')).toEqual([
      { text: 'veja ' },
      { url: 'https://exemplo.com/a?b=1#c', href: 'https://exemplo.com/a?b=1#c' },
      { text: ' e ' },
      { url: 'http://x.org', href: 'http://x.org/' }
    ])
  })

  it('www. abre como https', () => {
    expect(splitLinks('www.google.com')).toEqual([{ url: 'www.google.com', href: 'https://www.google.com/' }])
  })

  it('pontuação da frase no fim não entra no link', () => {
    expect(splitLinks('olha https://a.com/x. Legal!')).toEqual([
      { text: 'olha ' },
      { url: 'https://a.com/x', href: 'https://a.com/x' },
      { text: '. Legal!' }
    ])
    expect(splitLinks('https://a.com?!')[0]).toEqual({ url: 'https://a.com', href: 'https://a.com/' })
  })

  it('parênteses: fecha a frase, mas fica quando faz parte do link', () => {
    expect(splitLinks('(ver https://a.com/x)')).toEqual([
      { text: '(ver ' },
      { url: 'https://a.com/x', href: 'https://a.com/x' },
      { text: ')' }
    ])
    const wiki = 'https://pt.wikipedia.org/wiki/Java_(linguagem)'
    expect(splitLinks(wiki)).toEqual([{ url: wiki, href: wiki }])
  })

  it('ignora o que não é link de verdade', () => {
    expect(splitLinks('https:// sozinho')).toEqual([{ text: 'https:// sozinho' }])
    expect(splitLinks('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }])
    expect(splitLinks('file:///C:/x.txt')).toEqual([{ text: 'file:///C:/x.txt' }])
  })

  it('link colado em outra palavra não é pego pela metade', () => {
    expect(splitLinks('xhttps://a.com')).toEqual([{ text: 'xhttps://a.com' }])
  })

  it('vários links e quebra de linha', () => {
    const parts = splitLinks('https://a.com\nhttps://b.com')
    expect(parts.filter((p) => 'url' in p)).toHaveLength(2)
    expect(parts[1]).toEqual({ text: '\n' })
  })
})

describe('externalUrl', () => {
  it('só aceita http e https', () => {
    expect(externalUrl('https://a.com')).toBe('https://a.com/')
    expect(externalUrl('http://a.com/x')).toBe('http://a.com/x')
    expect(externalUrl('file:///etc/passwd')).toBeNull()
    expect(externalUrl('javascript:alert(1)')).toBeNull()
    expect(externalUrl('ms-settings:')).toBeNull()
    expect(externalUrl('não é url')).toBeNull()
  })
})
