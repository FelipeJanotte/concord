/**
 * Supressão de ruído automática (B13) como processador de faixa do `livekit-client`
 * (`LocalAudioTrack.setProcessor`). Roda no app de quem fala: quem ouve recebe o áudio já limpo.
 *
 *   microfone ─┬─► seco (gain) ───────────────┬─► volume (gain) ─► MediaStreamDestination ─► faixa publicada
 *              ├─► RNNoise ─► molhado (gain) ─┘
 *              └─► analisador (mede o ruído de fundo)
 *
 * A cada 250 ms o `NoiseDecider` diz se o ambiente pede o filtro avançado; a troca é um
 * crossfade entre seco e molhado (sem estalo, sem republicar a faixa). Com o avançado ligado,
 * a supressão nativa do WebRTC é desligada para não processar duas vezes (som "abafado").
 * Se o motor não carrega, dá erro no AudioWorklet ou o PC é fraco, fica no filtro nativo.
 * O "volume" é o volume do microfone das Configurações de voz (`setGain`, 0 a 200%).
 */
import { Track, type AudioProcessorOptions, type TrackProcessor } from 'livekit-client'
import { NoiseDecider, rmsToDb, type DeciderOptions } from './decide'
import type { NoiseEngineLoader, NoiseEngineNode } from './engine'
import { clampMicGain, createMonoDestination, forceMono, type GainControl } from '../mic-gain'

/** O que aparece em Configurações de voz. */
export type NoiseMode = 'light' | 'advanced' | 'light-fallback'

export interface NoiseProcessorDeps {
  loadEngine: NoiseEngineLoader
  /** núcleos do processador (PC com ≤ 2 não usa o avançado) */
  cores: () => number
  now: () => number
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
  deciderOptions?: Partial<DeciderOptions>
}

const TICK_MS = 250
const FADE_S = 0.15
export const MIN_CORES = 3

export class AutoNoiseProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>, GainControl {
  readonly name = 'concord-auto-noise'
  processedTrack?: MediaStreamTrack

  private ctx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private dry: GainNode | null = null
  private wet: GainNode | null = null
  private volume: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private engine: NoiseEngineNode | null = null
  private timer: unknown = null
  private input: MediaStreamTrack | null = null
  private decider = new NoiseDecider()
  private mode: NoiseMode = 'light'
  private buffer = new Float32Array(2048)

  constructor(
    private readonly deps: NoiseProcessorDeps,
    private readonly onMode: (mode: NoiseMode) => void = () => {},
    private gain = 1
  ) {}

  /** Volume do microfone (0 a 2), na hora. */
  setGain(gain: number): void {
    this.gain = clampMicGain(gain)
    if (this.ctx && this.volume) this.volume.gain.setTargetAtTime(this.gain, this.ctx.currentTime, 0.02)
  }

  async init({ track, audioContext }: AudioProcessorOptions): Promise<void> {
    const ctx = audioContext
    this.ctx = ctx
    this.input = track
    this.decider = new NoiseDecider(this.deps.deciderOptions)

    const source = ctx.createMediaStreamSource(new MediaStream([track]))
    const out = createMonoDestination(ctx)
    const dry = ctx.createGain()
    const wet = ctx.createGain()
    const volume = ctx.createGain()
    volume.gain.value = this.gain
    volume.connect(out)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    this.buffer = new Float32Array(analyser.fftSize)
    dry.gain.value = 1
    wet.gain.value = 0
    source.connect(dry).connect(volume)
    source.connect(analyser)
    Object.assign(this, { source, dry, wet, volume, analyser })

    if (this.deps.cores() >= MIN_CORES) {
      try {
        const engine = await this.deps.loadEngine(ctx)
        this.engine = engine
        forceMono(engine.node)
        source.connect(engine.node).connect(wet).connect(volume)
        // Erro dentro do AudioWorklet (ex.: o WASM quebrou): para de usar o avançado.
        ;(engine.node as AudioWorkletNode).onprocessorerror = () => this.fallback('erro no processador de áudio')
      } catch (err) {
        console.warn('[ruído] filtro avançado indisponível, usando o nativo:', err)
        this.engine = null
      }
    }
    this.processedTrack = out.stream.getAudioTracks()[0]
    this.setMode(this.engine ? 'light' : 'light-fallback', true)
    if (this.engine) this.timer = this.deps.setInterval(() => this.tick(), TICK_MS)
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy()
    await this.init(opts)
  }

  async destroy(): Promise<void> {
    if (this.timer !== null) this.deps.clearInterval(this.timer)
    this.timer = null
    this.engine?.destroy()
    this.engine = null
    for (const node of [this.source, this.dry, this.wet, this.volume, this.analyser]) node?.disconnect()
    this.source = this.dry = this.wet = this.volume = this.analyser = null
    this.processedTrack = undefined
    void this.setNativeSuppression(true) // devolve a faixa como veio
  }

  get currentMode(): NoiseMode {
    return this.mode
  }

  /** Uma medição: nível RMS do microfone cru → decisão do modo. */
  private tick(): void {
    if (!this.analyser) return
    this.analyser.getFloatTimeDomainData(this.buffer)
    let sum = 0
    for (const v of this.buffer) sum += v * v
    const advanced = this.decider.update(rmsToDb(Math.sqrt(sum / this.buffer.length)), this.deps.now())
    this.setMode(advanced ? 'advanced' : 'light')
  }

  private fallback(reason: string): void {
    console.warn(`[ruído] ${reason}; voltando para o filtro nativo`)
    if (this.timer !== null) this.deps.clearInterval(this.timer)
    this.timer = null
    this.engine?.node.disconnect()
    this.setMode('light-fallback')
  }

  private setMode(mode: NoiseMode, force = false): void {
    if (mode === this.mode && !force) return
    this.mode = mode
    const advanced = mode === 'advanced'
    if (this.ctx && this.dry && this.wet) {
      const t = this.ctx.currentTime
      this.dry.gain.setTargetAtTime(advanced ? 0 : 1, t, FADE_S / 3)
      this.wet.gain.setTargetAtTime(advanced ? 1 : 0, t, FADE_S / 3)
    }
    void this.setNativeSuppression(!advanced)
    this.onMode(mode)
  }

  private async setNativeSuppression(on: boolean): Promise<void> {
    try {
      await this.input?.applyConstraints({ noiseSuppression: on })
    } catch {
      // nem todo dispositivo deixa trocar com a faixa aberta; o avançado continua valendo
    }
  }
}
