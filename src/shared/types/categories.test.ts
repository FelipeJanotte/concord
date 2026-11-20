import { describe, expect, it } from 'vitest'
import { normalizeCategoryName, parseLayout } from './categories'

describe('normalizeCategoryName', () => {
  it('tira espaços sobrando e corta em 32 caracteres', () => {
    expect(normalizeCategoryName('  Jogos   de   tiro ')).toBe('Jogos de tiro')
    expect(normalizeCategoryName('x'.repeat(40))).toBe('x'.repeat(32))
  })

  it('recusa vazio e o que não é texto', () => {
    expect(normalizeCategoryName('   ')).toBeNull()
    expect(normalizeCategoryName(42)).toBeNull()
    expect(normalizeCategoryName(undefined)).toBeNull()
  })
})

describe('parseLayout', () => {
  const expected = { categoryIds: ['k1', 'k2'], channelIds: ['a', 'b', 'c'] }
  const valid = {
    categories: ['k2', 'k1'],
    channels: [
      { id: 'c', categoryId: null },
      { id: 'a', categoryId: 'k2' },
      { id: 'b', categoryId: 'k1' }
    ]
  }

  it('aceita a ordem inteira com cada canal e categoria uma vez', () => {
    expect(parseLayout(valid, expected)).toEqual(valid)
  })

  it('recusa canal faltando, repetido ou desconhecido', () => {
    expect(parseLayout({ ...valid, channels: valid.channels.slice(1) }, expected)).toBeNull()
    expect(parseLayout({ ...valid, channels: [...valid.channels, { id: 'a', categoryId: null }] }, expected)).toBeNull()
    expect(parseLayout({ ...valid, channels: [...valid.channels.slice(1), { id: 'z', categoryId: null }] }, expected)).toBeNull()
  })

  it('recusa categoria faltando, repetida ou canal numa categoria que não existe', () => {
    expect(parseLayout({ ...valid, categories: ['k1'] }, expected)).toBeNull()
    expect(parseLayout({ ...valid, categories: ['k1', 'k1'] }, expected)).toBeNull()
    expect(parseLayout({ ...valid, channels: [{ id: 'a', categoryId: 'k9' }, ...valid.channels.slice(1)] }, expected)).toBeNull()
  })

  it('recusa formato errado', () => {
    expect(parseLayout(null, expected)).toBeNull()
    expect(parseLayout({ categories: 'k1', channels: [] }, expected)).toBeNull()
    expect(parseLayout({ categories: ['k1', 'k2'], channels: [{ id: 1 }] }, expected)).toBeNull()
  })
})
