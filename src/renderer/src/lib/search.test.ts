import { describe, expect, it } from 'vitest'
import { findAuthor, highlightParts, parseSearchInput } from './search'

describe('parseSearchInput', () => {
  it('separa o filtro de: do texto', () => {
    expect(parseSearchInput('de:Ana bom dia')).toEqual({ query: 'bom dia', authorName: 'Ana' })
    expect(parseSearchInput('bom De:ana dia')).toEqual({ query: 'bom dia', authorName: 'ana' })
    expect(parseSearchInput('de:"Ana Maria" oi')).toEqual({ query: 'oi', authorName: 'Ana Maria' })
    expect(parseSearchInput('  só texto  ')).toEqual({ query: 'só texto' })
    expect(parseSearchInput('de:@Bia')).toEqual({ query: '', authorName: 'Bia' })
  })
})

describe('findAuthor', () => {
  const people = [
    { accountId: 'a1', name: 'Ana', tag: 'x1' },
    { accountId: 'a2', name: 'Ana', tag: 'y2' },
    { accountId: 'b1', name: 'Bia', tag: 'b1' }
  ]
  it('acha pelo nome sem diferenciar maiúsculas, ou pelo nome#id quando o nome repete', () => {
    expect(findAuthor('bia', people)).toBe('b1')
    expect(findAuthor('Ana#y2', people)).toBe('a2')
    expect(findAuthor('Ana', people)).toBe('a1')
    expect(findAuthor('Caio', people)).toBeUndefined()
  })
})

describe('highlightParts', () => {
  it('marca cada ocorrência sem diferenciar maiúsculas', () => {
    expect(highlightParts('Bom dia, bom DIA', 'dia')).toEqual([
      { text: 'Bom ', match: false },
      { text: 'dia', match: true },
      { text: ', bom ', match: false },
      { text: 'DIA', match: true }
    ])
  })

  it('texto longo vira um trecho em volta da primeira ocorrência', () => {
    const text = `${'a'.repeat(300)} alvo ${'b'.repeat(300)}`
    const parts = highlightParts(text, 'alvo')
    expect(parts[0].text.startsWith('…')).toBe(true)
    expect(parts.find((p) => p.match)?.text).toBe('alvo')
    expect(parts.at(-1)!.text.endsWith('…')).toBe(true)
    expect(parts.map((p) => p.text).join('').length).toBeLessThan(200)
  })

  it('sem busca (só de:) devolve o começo do texto sem marca', () => {
    expect(highlightParts('olá  \n mundo', '')).toEqual([{ text: 'olá mundo', match: false }])
  })
})
