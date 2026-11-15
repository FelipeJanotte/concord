/**
 * Toque das chamadas (B8), gerado na hora pela Web Audio como os outros sons da interface
 * (sem arquivo de áudio). Repete até `stop()`:
 * - `incoming`: três notas rápidas subindo a cada 2 s (alguém está me ligando);
 * - `outgoing`: um tom duplo a cada 3 s (estou chamando, esperando atender).
 */
export type RingKind = 'incoming' | 'outgoing'

const PATTERNS: Record<RingKind, { period: number; notes: { freq: number; at: number; length: number }[] }> = {
  incoming: {
    period: 2000,
    notes: [
      { freq: 659.25, at: 0, length: 0.18 },
      { freq: 783.99, at: 0.2, length: 0.18 },
      { freq: 1046.5, at: 0.4, length: 0.3 }
    ]
  },
  outgoing: {
    period: 3000,
    notes: [
      { freq: 440, at: 0, length: 0.9 },
      { freq: 480, at: 0, length: 0.9 }
    ]
  }
}

/** Volume máximo de verdade: toque chama atenção, mas não deve assustar. */
const PEAK_GAIN = 0.2

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> }

export interface RingerDeps {
  createContext: () => AudioContext
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

const defaultDeps: RingerDeps = {
  createContext: () => new AudioContext(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>)
}

export class Ringer {
  private ctx: SinkContext | null = null
  private timer: unknown = null
  private current: RingKind | null = null
  private readonly deps: RingerDeps

  constructor(deps: Partial<RingerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps }
  }

  /** O que está tocando agora (null = nada). */
  get kind(): RingKind | null {
    return this.current
  }

  /** Começa a tocar (troca de toque se outro estava tocando; o mesmo de novo não reinicia). */
  start(kind: RingKind, opts: { volume: number; outputId: string | null }): void {
    if (this.current === kind) return
    this.stop()
    this.current = kind
    const ring = (): void => this.ring(kind, opts)
    ring()
    this.timer = this.deps.setInterval(ring, PATTERNS[kind].period)
  }

  stop(): void {
    if (this.timer !== null) this.deps.clearInterval(this.timer)
    this.timer = null
    this.current = null
  }

  private ring(kind: RingKind, { volume, outputId }: { volume: number; outputId: string | null }): void {
    const gain = Math.min(1, Math.max(0, volume)) * PEAK_GAIN
    if (gain === 0) return
    try {
      this.ctx ??= this.deps.createContext() as SinkContext
      const ctx = this.ctx
      if (ctx.setSinkId) ctx.setSinkId(outputId ?? '').catch(() => {})
      void ctx.resume?.()
      const start = ctx.currentTime
      for (const n of PATTERNS[kind].notes) this.note(ctx, n.freq, start + n.at, n.length, gain)
    } catch (err) {
      console.warn('[toque] não foi possível tocar:', err)
    }
  }

  private note(ctx: AudioContext, freq: number, at: number, length: number, gain: number): void {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, at)
    env.gain.setValueAtTime(0.0001, at)
    env.gain.exponentialRampToValueAtTime(gain, at + 0.02)
    env.gain.exponentialRampToValueAtTime(0.0001, at + length)
    osc.connect(env)
    env.connect(ctx.destination)
    osc.start(at)
    osc.stop(at + length + 0.02)
  }
}
