import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTime, formatTimestamp, initials, omit } from './utils'

describe('initials', () => {
  it('usa a primeira letra das duas primeiras palavras', () => {
    expect(initials('Felipe Janotte')).toBe('FJ')
    expect(initials('  ana   maria  souza ')).toBe('AM')
  })

  it('usa as duas primeiras letras de um nome só', () => {
    expect(initials('concord')).toBe('CO')
  })

  it('funciona com nome de uma letra', () => {
    expect(initials('x')).toBe('X')
  })
})

describe('omit', () => {
  it('remove a chave sem alterar o original', () => {
    const original = { a: 1, b: 2 }
    expect(omit(original, 'a')).toEqual({ b: 2 })
    expect(original).toEqual({ a: 1, b: 2 })
  })

  it('devolve uma cópia mesmo quando a chave não existe', () => {
    const original = { a: 1 }
    const copy = omit(original, 'z')
    expect(copy).toEqual({ a: 1 })
    expect(copy).not.toBe(original)
  })
})

describe('formatTime', () => {
  it('formata hora e minuto com dois dígitos', () => {
    expect(formatTime(new Date(2026, 0, 5, 9, 7).getTime())).toBe('09:07')
  })
})

describe('formatTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 14, 15, 30))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mostra "Hoje" para hoje', () => {
    expect(formatTimestamp(new Date(2026, 10, 14, 8, 5).getTime())).toBe('Hoje às 08:05')
  })

  it('mostra "Ontem" para ontem', () => {
    expect(formatTimestamp(new Date(2026, 10, 13, 23, 59).getTime())).toBe('Ontem às 23:59')
  })

  it('mostra a data para dias anteriores', () => {
    expect(formatTimestamp(new Date(2026, 10, 1, 12, 0).getTime())).toBe('01/11/2026 12:00')
  })

  it('trata a virada do mês como "Ontem"', () => {
    vi.setSystemTime(new Date(2026, 11, 1, 10, 0))
    expect(formatTimestamp(new Date(2026, 10, 30, 20, 0).getTime())).toBe('Ontem às 20:00')
  })
})
