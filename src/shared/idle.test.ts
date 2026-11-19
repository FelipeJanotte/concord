import { describe, expect, it } from 'vitest'
import { IDLE_AFTER_SECONDS, isIdle } from './idle'

describe('isIdle', () => {
  it('fica ausente com 10 minutos sem mexer no computador', () => {
    expect(IDLE_AFTER_SECONDS).toBe(600)
    expect(isIdle(599)).toBe(false)
    expect(isIdle(600)).toBe(true)
    expect(isIdle(3600)).toBe(true)
  })

  it('mexeu agora: não está ausente', () => {
    expect(isIdle(0)).toBe(false)
  })
})
