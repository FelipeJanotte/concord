import { rmsDb } from '../leveler/level'
import { nextSpeaking, SILENT, type SpeakingLevel } from './speaking'

export const SPEAKING_TICK_MS = 50
const ANALYSER_FFT_SIZE = 2048

export type TrackSource = () => MediaStreamTrack | null | undefined

export interface SpeakingDetectorDeps {
  createContext: () => AudioContext
  createStream: (track: MediaStreamTrack) => MediaStream
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

const defaultDeps: SpeakingDetectorDeps = {
  createContext: () => new AudioContext(),
  createStream: (track) => new MediaStream([track]),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number)
}

interface Meter {
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  samples: Float32Array<ArrayBuffer>
}

interface WatchedVoice {
  trackOf: TrackSource
  track: MediaStreamTrack | null
  meter: Meter | null
  level: SpeakingLevel
}

export class SpeakingDetector {
  onChange: ((speaking: string[]) => void) | null = null

  private ctx: AudioContext | null = null
  private voices = new Map<string, WatchedVoice>()
  private timer: unknown = null
  private reported: string[] = []
  private readonly deps: SpeakingDetectorDeps

  constructor(deps: Partial<SpeakingDetectorDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps }
  }

  watch(id: string, trackOf: TrackSource): void {
    this.unwatch(id)
    this.voices.set(id, { trackOf, track: null, meter: null, level: SILENT })
    this.timer ??= this.deps.setInterval(() => this.measure(), SPEAKING_TICK_MS)
  }

  unwatch(id: string): void {
    const voice = this.voices.get(id)
    if (!voice) return
    this.disconnect(voice)
    this.voices.delete(id)
    if (this.voices.size === 0) this.stopTimer()
    this.report()
  }

  destroy(): void {
    for (const voice of this.voices.values()) this.disconnect(voice)
    this.voices.clear()
    this.stopTimer()
    void this.ctx?.close()
    this.ctx = null
    this.reported = []
  }

  private measure(): void {
    for (const voice of this.voices.values()) {
      this.follow(voice)
      voice.level = nextSpeaking(voice.level, this.levelOf(voice), SPEAKING_TICK_MS)
    }
    this.report()
  }

  private follow(voice: WatchedVoice): void {
    const track = voice.trackOf() ?? null
    if (track === voice.track) return
    this.disconnect(voice)
    voice.track = track
    voice.meter = track ? this.meterFor(track) : null
  }

  private levelOf(voice: WatchedVoice): number {
    if (!voice.meter) return -Infinity
    voice.meter.analyser.getFloatTimeDomainData(voice.meter.samples)
    return rmsDb(voice.meter.samples)
  }

  private meterFor(track: MediaStreamTrack): Meter {
    const ctx = (this.ctx ??= this.deps.createContext())
    const source = ctx.createMediaStreamSource(this.deps.createStream(track))
    const analyser = ctx.createAnalyser()
    analyser.fftSize = ANALYSER_FFT_SIZE
    source.connect(analyser)
    void ctx.resume?.()
    return { source, analyser, samples: new Float32Array(analyser.fftSize) }
  }

  private disconnect(voice: WatchedVoice): void {
    voice.meter?.source.disconnect()
    voice.meter = null
    voice.track = null
  }

  private report(): void {
    const next = [...this.voices].filter(([, voice]) => voice.level.speaking).map(([id]) => id)
    if (next.length === this.reported.length && next.every((id, i) => this.reported[i] === id)) return
    this.reported = next
    this.onChange?.(next)
  }

  private stopTimer(): void {
    if (this.timer === null) return
    this.deps.clearInterval(this.timer)
    this.timer = null
  }
}
