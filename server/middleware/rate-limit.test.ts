import { describe, expect, it } from 'vitest'
import { LIMITS, limiters, RateLimiter, retryText } from './rate-limit'

function clock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('RateLimiter', () => {
  it('permite a rajada inteira e recusa a próxima, dizendo quando tentar', () => {
    const c = clock()
    const limiter = new RateLimiter({ capacity: 3, perSecond: 1 }, c.now)
    expect([limiter.take('a'), limiter.take('a'), limiter.take('a')]).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(limiter.take('a')).toEqual({ ok: false, retryAfterMs: 1000 })
  })

  it('devolve fichas com o tempo (sem passar da capacidade)', () => {
    const c = clock()
    const limiter = new RateLimiter({ capacity: 2, perSecond: 1 }, c.now)
    limiter.take('a')
    limiter.take('a')
    c.advance(500)
    expect(limiter.take('a')).toEqual({ ok: false, retryAfterMs: 500 })
    c.advance(500)
    expect(limiter.take('a')).toEqual({ ok: true })
    c.advance(60_000) // muito tempo parado: volta só até 2
    expect(limiter.take('a').ok).toBe(true)
    expect(limiter.take('a').ok).toBe(true)
    expect(limiter.take('a').ok).toBe(false)
  })

  it('cada chave tem o seu balde', () => {
    const limiter = new RateLimiter({ capacity: 1, perSecond: 1 }, clock().now)
    expect(limiter.take('ana').ok).toBe(true)
    expect(limiter.take('ana').ok).toBe(false)
    expect(limiter.take('bia').ok).toBe(true)
  })

  it('taxa lenta calcula a espera certa (1 por minuto)', () => {
    const limiter = new RateLimiter({ capacity: 1, perSecond: 1 / 60 }, clock().now)
    limiter.take('a')
    expect(limiter.take('a')).toEqual({ ok: false, retryAfterMs: 60_000 })
  })

  it('prune esquece só quem já está com o balde cheio', () => {
    const c = clock()
    const limiter = new RateLimiter({ capacity: 2, perSecond: 1 }, c.now)
    limiter.take('velho')
    c.advance(5000)
    limiter.take('novo')
    limiter.prune()
    expect(limiter.size).toBe(1)
  })
})

describe('regras do Concord', () => {
  it('existe um limitador para cada regra', () => {
    expect(Object.keys(limiters).sort()).toEqual(Object.keys(LIMITS).sort())
  })

  it('regras razoáveis: rajada de 10 mensagens e 5 cadastros por IP', () => {
    expect(LIMITS.message.capacity).toBe(10)
    expect(LIMITS.register.capacity).toBe(5)
  })
})

describe('retryText', () => {
  it('arredonda para cima, mínimo 1 s', () => {
    expect(retryText(1)).toBe('Tente de novo em 1 s.')
    expect(retryText(1001)).toBe('Tente de novo em 2 s.')
    expect(retryText(60_000)).toBe('Tente de novo em 60 s.')
  })
})
