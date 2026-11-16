import { describe, expect, it } from 'vitest'
import {
  clampLevelerTarget,
  LEVELER_GAIN_MAX,
  LEVELER_GAIN_MIN,
  LEVELER_TARGETS,
  nextGain,
  rmsDb,
  SPEECH_FLOOR_DB
} from './level'

const sine = (amplitude: number, length = 480): Float32Array =>
  Float32Array.from({ length }, (_, i) => amplitude * Math.sin((2 * Math.PI * i) / 48))

const settle = (measuredDb: number, targetDb: number, steps = 400): number => {
  let gain = 1
  for (let i = 0; i < steps; i++) gain = nextGain(gain, measuredDb, targetDb, 100)
  return gain
}

describe('rmsDb', () => {
  it('senoide de amplitude 1 fica em -3 dBFS', () => {
    expect(rmsDb(sine(1))).toBeCloseTo(-3.01, 1)
  })

  it('metade da amplitude perde 6 dB', () => {
    expect(rmsDb(sine(0.5)) - rmsDb(sine(1))).toBeCloseTo(-6.02, 1)
  })

  it('silêncio e bloco vazio dão -Infinity', () => {
    expect(rmsDb(new Float32Array(480))).toBe(-Infinity)
    expect(rmsDb(new Float32Array(0))).toBe(-Infinity)
  })
})

describe('nextGain', () => {
  it('voz baixa converge para o ganho que leva ao alvo', () => {
    expect(settle(-30, -24)).toBeCloseTo(10 ** (6 / 20), 2)
  })

  it('voz alta converge para baixo', () => {
    expect(settle(-18, -24)).toBeCloseTo(10 ** (-6 / 20), 2)
  })

  it('abaixo do piso de fala (silêncio, ruído) não mexe no ganho', () => {
    expect(nextGain(1.7, SPEECH_FLOOR_DB - 1, -24, 100)).toBe(1.7)
    expect(nextGain(0.6, -Infinity, -24, 100)).toBe(0.6)
  })

  it('não passa dos limites', () => {
    expect(settle(-49, -18)).toBeCloseTo(LEVELER_GAIN_MAX, 5)
    expect(settle(0, -30)).toBeCloseTo(LEVELER_GAIN_MIN, 5)
  })

  it('abaixa mais rápido do que aumenta', () => {
    const down = 1 - nextGain(1, -18, -24, 100)
    const up = nextGain(1, -30, -24, 100) - 1
    expect(down / (1 - 10 ** (-6 / 20))).toBeGreaterThan(up / (10 ** (6 / 20) - 1))
  })

  it('anda aos poucos (sem pulo de uma vez)', () => {
    const gain = nextGain(1, -36, -24, 100)
    expect(gain).toBeGreaterThan(1)
    expect(gain).toBeLessThan(1.2)
  })
})

describe('clampLevelerTarget', () => {
  it('aceita os alvos conhecidos e volta ao médio no resto', () => {
    for (const t of Object.keys(LEVELER_TARGETS)) expect(clampLevelerTarget(t)).toBe(t)
    expect(clampLevelerTarget('altíssimo')).toBe('medium')
    expect(clampLevelerTarget(3)).toBe('medium')
    expect(clampLevelerTarget(undefined)).toBe('medium')
  })

  it('alvos em ordem: baixo < médio < alto', () => {
    expect(LEVELER_TARGETS.low).toBeLessThan(LEVELER_TARGETS.medium)
    expect(LEVELER_TARGETS.medium).toBeLessThan(LEVELER_TARGETS.high)
  })
})
