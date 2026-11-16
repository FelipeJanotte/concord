import { LEVELER_TARGETS, nextGain, rmsDb, type LevelerTarget } from './level'

const TICK_MS = 100
const SMOOTHING_SECONDS = 0.05
const REPORT_STEP = 0.05

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> }

export interface LevelerDeps {
  createContext: () => AudioContext
  createStream: (track: MediaStreamTrack) => MediaStream
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

const defaultDeps: LevelerDeps = {
  createContext: () => new AudioContext(),
  createStream: (track) => new MediaStream([track]),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number)
}

interface LeveledVoice {
  accountId: string
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  output: GainNode
  samples: Float32Array<ArrayBuffer>
  autoGain: number
  volume: number
}

export type LevelerGains = Record<string, number>

export class VoiceLeveler {
  onGainsChange: ((gains: LevelerGains) => void) | null = null

  private ctx: SinkContext | null = null
  private voices = new Map<object, LeveledVoice>()
  private target: LevelerTarget = 'medium'
  private outputId: string | null = null
  private timer: unknown = null
  private reported: LevelerGains = {}
  private readonly deps: LevelerDeps

  constructor(deps: Partial<LevelerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps }
  }

  add(key: object, accountId: string, track: MediaStreamTrack, volume = 1): void {
    this.remove(key)
    const ctx = this.context()
    const source = ctx.createMediaStreamSource(this.deps.createStream(track))
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    const output = ctx.createGain()
    output.gain.value = volume
    source.connect(analyser).connect(output).connect(ctx.destination)
    this.voices.set(key, { accountId, source, analyser, output, samples: new Float32Array(analyser.fftSize), autoGain: 1, volume })
    void ctx.resume?.()
    this.timer ??= this.deps.setInterval(() => this.measure(), TICK_MS)
  }

  remove(key: object): void {
    const voice = this.voices.get(key)
    if (!voice) return
    voice.source.disconnect()
    voice.analyser.disconnect()
    voice.output.disconnect()
    this.voices.delete(key)
    if (this.voices.size === 0) this.stopTimer()
    this.report()
  }

  setVolume(key: object, volume: number): void {
    const voice = this.voices.get(key)
    if (!voice) return
    voice.volume = volume
    this.apply(voice)
  }

  setTarget(target: LevelerTarget): void {
    this.target = target
  }

  setOutput(outputId: string | null): void {
    this.outputId = outputId
    if (this.ctx) this.useOutput(this.ctx)
  }

  destroy(): void {
    for (const key of [...this.voices.keys()]) this.remove(key)
    this.stopTimer()
    void this.ctx?.close()
    this.ctx = null
  }

  private context(): SinkContext {
    if (!this.ctx) {
      this.ctx = this.deps.createContext() as SinkContext
      if (this.outputId) this.useOutput(this.ctx)
    }
    return this.ctx
  }

  private useOutput(ctx: SinkContext): void {
    ctx.setSinkId?.(this.outputId ?? '').catch((err) => console.warn('[equalizador] saída indisponível, usando a padrão:', err))
  }

  private measure(): void {
    const targetDb = LEVELER_TARGETS[this.target]
    for (const voice of this.voices.values()) {
      voice.analyser.getFloatTimeDomainData(voice.samples)
      const autoGain = nextGain(voice.autoGain, rmsDb(voice.samples), targetDb, TICK_MS)
      if (autoGain === voice.autoGain) continue
      voice.autoGain = autoGain
      this.apply(voice)
    }
    this.report()
  }

  private apply(voice: LeveledVoice): void {
    const ctx = this.ctx
    if (ctx) voice.output.gain.setTargetAtTime(voice.autoGain * voice.volume, ctx.currentTime, SMOOTHING_SECONDS)
  }

  private report(): void {
    const next: LevelerGains = {}
    for (const voice of this.voices.values()) {
      const rounded = Math.round(voice.autoGain / REPORT_STEP) * REPORT_STEP
      if (Math.abs(rounded - 1) > 1e-9) next[voice.accountId] = Number(rounded.toFixed(2))
    }
    const prevKeys = Object.keys(this.reported)
    const nextKeys = Object.keys(next)
    if (prevKeys.length === nextKeys.length && nextKeys.every((k) => this.reported[k] === next[k])) return
    this.reported = next
    this.onGainsChange?.(next)
  }

  private stopTimer(): void {
    if (this.timer === null) return
    this.deps.clearInterval(this.timer)
    this.timer = null
  }
}
