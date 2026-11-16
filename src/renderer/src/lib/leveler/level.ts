export const LEVELER_TARGETS = { low: -30, medium: -24, high: -18 } as const

export type LevelerTarget = keyof typeof LEVELER_TARGETS

export const SPEECH_FLOOR_DB = -50
export const LEVELER_GAIN_MIN = 0.25
export const LEVELER_GAIN_MAX = 3

const LOWERING_TIME_MS = 1000
const RAISING_TIME_MS = 3000

export function clampLevelerTarget(value: unknown): LevelerTarget {
  return typeof value === 'string' && Object.hasOwn(LEVELER_TARGETS, value) ? (value as LevelerTarget) : 'medium'
}

export function rmsDb(samples: Float32Array): number {
  if (samples.length === 0) return -Infinity
  let sum = 0
  for (const s of samples) sum += s * s
  return 10 * Math.log10(sum / samples.length)
}

export function nextGain(current: number, measuredDb: number, targetDb: number, elapsedMs: number): number {
  if (!(measuredDb >= SPEECH_FLOOR_DB)) return current
  const wanted = Math.min(LEVELER_GAIN_MAX, Math.max(LEVELER_GAIN_MIN, 10 ** ((targetDb - measuredDb) / 20)))
  const timeMs = wanted < current ? LOWERING_TIME_MS : RAISING_TIME_MS
  return current + (wanted - current) * (1 - Math.exp(-elapsedMs / timeMs))
}
