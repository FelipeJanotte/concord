import { Track, type AudioProcessorOptions, type TrackProcessor } from 'livekit-client'
import type { NoiseEngineLoader, NoiseEngineNode } from './engine'
import { clampMicGain, createMonoDestination, forceMono, type GainControl, type MicProcessorSettings } from '../mic-gain'
import { MicGate } from '../mic-gate'

export type NoiseMode = 'advanced' | 'light-fallback'

export interface NoiseProcessorDeps {
  loadEngine: NoiseEngineLoader
  cores: () => number
}

const FADE_S = 0.15
export const MIN_CORES = 3

export class AutoNoiseProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>, GainControl {
  readonly name = 'concord-noise'
  processedTrack?: MediaStreamTrack

  private ctx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private dry: GainNode | null = null
  private wet: GainNode | null = null
  private volume: GainNode | null = null
  private engine: NoiseEngineNode | null = null
  private gate: MicGate | null = null
  private mode: NoiseMode = 'light-fallback'
  private gain: number
  private sensitivityDb: number

  constructor(
    private readonly deps: NoiseProcessorDeps,
    private readonly onMode: (mode: NoiseMode) => void,
    private readonly settings: MicProcessorSettings
  ) {
    this.gain = clampMicGain(settings.gain)
    this.sensitivityDb = settings.sensitivityDb
  }

  setSensitivity(db: number): void {
    this.sensitivityDb = db
    this.gate?.setSensitivity(db)
  }

  setGain(gain: number): void {
    this.gain = clampMicGain(gain)
    if (this.ctx && this.volume) this.volume.gain.setTargetAtTime(this.gain, this.ctx.currentTime, 0.02)
  }

  async init({ track, audioContext: ctx }: AudioProcessorOptions): Promise<void> {
    this.ctx = ctx
    const source = ctx.createMediaStreamSource(new MediaStream([track]))
    const out = createMonoDestination(ctx)
    const dry = ctx.createGain()
    const wet = ctx.createGain()
    const volume = ctx.createGain()
    volume.gain.value = this.gain
    dry.gain.value = 1
    wet.gain.value = 0
    source.connect(dry).connect(volume)
    this.gate = new MicGate(ctx, volume, out, { ...this.settings, sensitivityDb: this.sensitivityDb })
    Object.assign(this, { source, dry, wet, volume })

    this.engine = await this.loadEngine(ctx)
    if (this.engine) {
      const node = this.engine.node
      forceMono(node)
      source.connect(node).connect(wet).connect(volume)
      ;(node as AudioWorkletNode).onprocessorerror = () => this.fallback('erro no processador de áudio')
    }
    this.processedTrack = out.stream.getAudioTracks()[0]
    this.setMode(this.engine ? 'advanced' : 'light-fallback')
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy()
    await this.init(opts)
  }

  async destroy(): Promise<void> {
    this.engine?.destroy()
    this.engine = null
    this.gate?.destroy()
    this.gate = null
    for (const node of [this.source, this.dry, this.wet, this.volume]) node?.disconnect()
    this.source = this.dry = this.wet = this.volume = null
    this.processedTrack = undefined
  }

  get currentMode(): NoiseMode {
    return this.mode
  }

  private async loadEngine(ctx: AudioContext): Promise<NoiseEngineNode | null> {
    if (this.deps.cores() < MIN_CORES) return null
    try {
      return await this.deps.loadEngine(ctx)
    } catch (err) {
      console.warn('[ruído] RNNoise indisponível, usando o nativo:', err)
      return null
    }
  }

  private fallback(reason: string): void {
    console.warn(`[ruído] ${reason}; voltando para o filtro nativo`)
    this.engine?.node.disconnect()
    this.setMode('light-fallback')
  }

  private setMode(mode: NoiseMode): void {
    this.mode = mode
    const advanced = mode === 'advanced'
    if (this.ctx && this.dry && this.wet) {
      const t = this.ctx.currentTime
      this.dry.gain.setTargetAtTime(advanced ? 0 : 1, t, FADE_S / 3)
      this.wet.gain.setTargetAtTime(advanced ? 1 : 0, t, FADE_S / 3)
    }
    this.onMode(mode)
  }
}
