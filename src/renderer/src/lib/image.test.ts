import { describe, expect, it } from 'vitest'
import { randomTag } from './image'

describe('randomTag', () => {
  it('gera sempre 4 dígitos (1000–9999)', () => {
    for (let i = 0; i < 500; i++) {
      const tag = randomTag()
      expect(tag).toMatch(/^\d{4}$/)
      expect(Number(tag)).toBeGreaterThanOrEqual(1000)
    }
  })
})
