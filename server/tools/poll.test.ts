// Enquete (v4): validação da criação e da escolha do voto.
import { describe, expect, it } from 'vitest'
import { newPoll, validateChoices, validatePoll } from './poll'

describe('validatePoll', () => {
  it('limpa a pergunta e as opções, ignora opções vazias e lê `multiple`', () => {
    expect(validatePoll({ question: '  Qual   mapa? ', options: [' Dust 2 ', '', 'Mirage'], multiple: true })).toEqual({
      question: 'Qual mapa?',
      options: ['Dust 2', 'Mirage'],
      multiple: true
    })
    expect(validatePoll({ question: 'Q', options: ['a', 'b'], multiple: 'sim' })).toMatchObject({ multiple: false })
  })

  it('recusa com mensagens claras', () => {
    expect(validatePoll({ question: '  ', options: ['a', 'b'] })).toBe('A pergunta precisa ter de 1 a 200 caracteres')
    expect(validatePoll({ question: 'x'.repeat(201), options: ['a', 'b'] })).toBe('A pergunta precisa ter de 1 a 200 caracteres')
    expect(validatePoll({ question: 'Q', options: 'a,b' })).toBe('Lista de opções inválida')
    expect(validatePoll({ question: 'Q', options: ['a', ''] })).toBe('Coloque pelo menos 2 opções')
    expect(validatePoll({ question: 'Q', options: Array.from({ length: 11 }, (_, i) => `op${i}`) })).toBe('No máximo 10 opções')
    expect(validatePoll({ question: 'Q', options: ['a'.repeat(81), 'b'] })).toBe('Cada opção pode ter no máximo 80 caracteres')
    expect(validatePoll({ question: 'Q', options: ['Sim', 'SIM'] })).toBe('Opção repetida: SIM')
    expect(validatePoll(null)).toBe('A pergunta precisa ter de 1 a 200 caracteres')
  })

  it('newPoll começa sem votos e aberta', () => {
    expect(newPoll({ question: 'Q', options: ['a', 'b', 'c'], multiple: false })).toEqual({
      question: 'Q',
      options: ['a', 'b', 'c'],
      multiple: false,
      counts: [0, 0, 0],
      voters: 0,
      closed: false
    })
  })
})

describe('validateChoices', () => {
  const single = newPoll({ question: 'Q', options: ['a', 'b', 'c'], multiple: false })
  const multi = { ...single, multiple: true }

  it('aceita vazio (tirar voto), um índice, e vários só em enquete múltipla (ordenados)', () => {
    expect(validateChoices(single, [])).toEqual([])
    expect(validateChoices(single, [2])).toEqual([2])
    expect(validateChoices(multi, [2, 0])).toEqual([0, 2])
    expect(validateChoices(single, [0, 1])).toBe('Esta enquete aceita só uma opção')
  })

  it('recusa índice fora da faixa, não inteiro, repetido ou formato errado', () => {
    expect(validateChoices(single, [3])).toBe('Opção inválida')
    expect(validateChoices(single, [-1])).toBe('Opção inválida')
    expect(validateChoices(single, [0.5])).toBe('Opção inválida')
    expect(validateChoices(single, ['0'])).toBe('Opção inválida')
    expect(validateChoices(multi, [1, 1])).toBe('Opção repetida')
    expect(validateChoices(single, 1)).toBe('Voto inválido')
  })
})
