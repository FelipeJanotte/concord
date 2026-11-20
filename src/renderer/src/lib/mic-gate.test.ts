import { describe, expect, it } from 'vitest'
import { CLOSED_GATE, GATE_HOLD_MS, SENSITIVITY_DEFAULT_DB, clampSensitivity, nextGate } from './mic-gate'

describe('clampSensitivity', () => {
  it('de -100 a 0 dB; inválido volta ao padrão', () => {
    expect(clampSensitivity(-40)).toBe(-40)
    expect(clampSensitivity(-150)).toBe(-100)
    expect(clampSensitivity(10)).toBe(0)
    expect(clampSensitivity(Number.NaN)).toBe(SENSITIVITY_DEFAULT_DB)
    expect(clampSensitivity('x')).toBe(SENSITIVITY_DEFAULT_DB)
  })
})

describe('nextGate', () => {
  it('começa fechado e abre quando o nível chega na linha', () => {
    expect(nextGate(CLOSED_GATE, -70, -60, 0).open).toBe(false)
    expect(nextGate(CLOSED_GATE, -60, -60, 0).open).toBe(true)
  })

  it('segura aberto por um tempo depois que o nível cai (não corta o fim da palavra)', () => {
    const loud = nextGate(CLOSED_GATE, -30, -60, 1000)
    expect(nextGate(loud, -80, -60, 1000 + GATE_HOLD_MS - 1).open).toBe(true)
    expect(nextGate(loud, -80, -60, 1000 + GATE_HOLD_MS).open).toBe(false)
  })

  it('fala contínua renova a espera', () => {
    let gate = nextGate(CLOSED_GATE, -30, -60, 0)
    gate = nextGate(gate, -30, -60, 250)
    expect(nextGate(gate, -80, -60, 500).open).toBe(true)
  })

  it('linha no mínimo deixa passar qualquer som', () => {
    expect(nextGate(CLOSED_GATE, -99, -100, 0).open).toBe(true)
  })
})
