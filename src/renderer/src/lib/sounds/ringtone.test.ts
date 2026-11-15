// Toque das chamadas (B8): repete até parar, troca de toque, volume zero não toca.
import { describe, expect, it, vi } from 'vitest'
import { Ringer } from './ringtone'

function fakeContext() {
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
  const ctx = {
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createOscillator: vi.fn(() => ({ type: '', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() })),
    createGain: vi.fn(() => ({ gain: param(), connect: vi.fn() }))
  }
  return ctx
}

function setup() {
  const ctx = fakeContext()
  const timers: { fn: () => void; ms: number }[] = []
  const cleared: unknown[] = []
  const ringer = new Ringer({
    createContext: () => ctx as unknown as AudioContext,
    setInterval: (fn, ms) => timers.push({ fn, ms }) - 1,
    clearInterval: (id) => cleared.push(id)
  })
  return { ctx, timers, cleared, ringer }
}

const opts = { volume: 1, outputId: null }

describe('Ringer', () => {
  it('toca na hora e repete no intervalo do toque; stop para', () => {
    const { ctx, timers, cleared, ringer } = setup()
    ringer.start('incoming', opts)
    expect(ringer.kind).toBe('incoming')
    expect(ctx.createOscillator).toHaveBeenCalledTimes(3) // três notas
    expect(timers[0].ms).toBe(2000)
    timers[0].fn()
    expect(ctx.createOscillator).toHaveBeenCalledTimes(6)
    ringer.stop()
    expect(cleared).toEqual([0])
    expect(ringer.kind).toBeNull()
  })

  it('o mesmo toque de novo não reinicia; outro toque troca', () => {
    const { timers, cleared, ringer } = setup()
    ringer.start('outgoing', opts)
    ringer.start('outgoing', opts)
    expect(timers).toHaveLength(1)
    expect(timers[0].ms).toBe(3000)
    ringer.start('incoming', opts)
    expect(cleared).toEqual([0])
    expect(ringer.kind).toBe('incoming')
  })

  it('volume zero não cria som', () => {
    const { ctx, ringer } = setup()
    ringer.start('incoming', { volume: 0, outputId: null })
    expect(ctx.createOscillator).not.toHaveBeenCalled()
  })
})
