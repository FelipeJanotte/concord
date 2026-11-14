import { describe, expect, it } from 'vitest'
import { initials, omit } from './utils'

describe('initials', () => {
  it('usa a primeira letra das duas primeiras palavras', () => {
    expect(initials('Felipe Janotte')).toBe('FJ')
    expect(initials('  ana   maria  souza ')).toBe('AM')
  })

  it('usa as duas primeiras letras de um nome só', () => {
    expect(initials('concord')).toBe('CO')
  })
})

describe('omit', () => {
  it('remove a chave sem alterar o original', () => {
    const original = { a: 1, b: 2 }
    expect(omit(original, 'a')).toEqual({ b: 2 })
    expect(original).toEqual({ a: 1, b: 2 })
  })
})
