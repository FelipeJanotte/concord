// Dado, moeda e sortear 1 nome (v4): validação e sorteio com um gerador previsível.
import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { flipCoins, pickOne, rollDice, validateCoin, validateDice, validatePick } from './random'
import type { Rand } from './teams'

/** Devolve os valores dados, em ordem (módulo `max`). */
const sequence = (...values: number[]): Rand => {
  let i = 0
  return (max) => values[i++ % values.length] % max
}

describe('dado', () => {
  it('valida lados (2–100) e quantidade (1–10), só inteiros', () => {
    expect(validateDice({ sides: 6, count: 2 })).toEqual({ sides: 6, count: 2 })
    expect(validateDice({ sides: 1, count: 1 })).toBe('O dado precisa ter de 2 a 100 lados')
    expect(validateDice({ sides: 101, count: 1 })).toBe('O dado precisa ter de 2 a 100 lados')
    expect(validateDice({ sides: 6.5, count: 1 })).toBe('O dado precisa ter de 2 a 100 lados')
    expect(validateDice({ sides: '6', count: 1 })).toBe('O dado precisa ter de 2 a 100 lados')
    expect(validateDice({ sides: 6, count: 0 })).toBe('Role de 1 a 10 dados')
    expect(validateDice({ sides: 6, count: 11 })).toBe('Role de 1 a 10 dados')
    expect(validateDice(null)).toBe('O dado precisa ter de 2 a 100 lados')
  })

  it('cada dado vai de 1 a `sides` e o total é a soma', () => {
    expect(rollDice({ sides: 6, count: 3 }, sequence(0, 5, 2))).toEqual({ sides: 6, rolls: [1, 6, 3], total: 10 })
  })

  it('com o acaso de verdade, todos os valores aparecem e nenhum sai da faixa', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) for (const r of rollDice({ sides: 6, count: 1 }, randomInt).rolls) seen.add(r)
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('moeda', () => {
  it('valida a quantidade (1–10)', () => {
    expect(validateCoin({ count: 3 })).toEqual({ count: 3 })
    expect(validateCoin({ count: 0 })).toBe('Jogue de 1 a 10 moedas')
    expect(validateCoin({ count: 11 })).toBe('Jogue de 1 a 10 moedas')
    expect(validateCoin({})).toBe('Jogue de 1 a 10 moedas')
  })

  it('0 = cara, 1 = coroa', () => {
    expect(flipCoins({ count: 3 }, sequence(0, 1, 0))).toEqual({ flips: ['cara', 'coroa', 'cara'] })
  })
})

describe('sortear 1', () => {
  it('limpa espaços, ignora linhas vazias e recusa repetidas', () => {
    expect(validatePick({ options: ['  Ana   Maria ', '', '   ', 'Bia'] })).toEqual({ options: ['Ana Maria', 'Bia'] })
    expect(validatePick({ options: ['Ana', 'ANA'] })).toBe('Opção repetida: ANA')
  })

  it('limites: 2–50 opções, até 100 caracteres cada', () => {
    expect(validatePick({ options: ['Ana'] })).toBe('Coloque pelo menos 2 opções')
    expect(validatePick({ options: ['Ana', '', ' '] })).toBe('Coloque pelo menos 2 opções')
    expect(validatePick({ options: Array.from({ length: 51 }, (_, i) => `op ${i}`) })).toBe('No máximo 50 opções')
    expect(validatePick({ options: ['a'.repeat(101), 'b'] })).toBe('Cada opção pode ter no máximo 100 caracteres')
    expect(validatePick({ options: 'Ana, Bia' })).toBe('Lista de opções inválida')
    expect(validatePick({ options: ['Ana', 7] })).toBe('Coloque pelo menos 2 opções')
  })

  it('sorteia uma das opções e devolve a lista usada', () => {
    expect(pickOne({ options: ['Ana', 'Bia', 'Caio'] }, sequence(2))).toEqual({ options: ['Ana', 'Bia', 'Caio'], picked: 'Caio' })
  })
})
