/**
 * Volume do microfone e volume de saída (Configurações de voz). Funções puras de limite e o
 * processador simples do microfone usado quando a supressão de ruído está desligada (com ela
 * ligada, o ganho entra no próprio `AutoNoiseProcessor`).
 *
 *   microfone ─► ganho ─► MediaStreamDestination ─► faixa publicada
 */
import { Track, type AudioProcessorOptions, type TrackProcessor } from 'livekit-client'

/** Volume do microfone: 0 (mudo) a 2 (200%). */
export const MIC_GAIN_MAX = 2
/** Volume de saída: 0 a 1 (o elemento de áudio não passa de 100%). */
export const OUTPUT_VOLUME_MAX = 1

const clamp = (v: unknown, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : fallback

export const clampMicGain = (v: unknown): number => clamp(v, MIC_GAIN_MAX, 1)
export const clampOutputVolume = (v: unknown): number => clamp(v, OUTPUT_VOLUME_MAX, 1)

export function forceMono(node: AudioNode): void {
  node.channelCount = 1
  node.channelCountMode = 'explicit'
}

export function createMonoDestination(ctx: AudioContext): MediaStreamAudioDestinationNode {
  const out = ctx.createMediaStreamDestination()
  forceMono(out)
  return out
}

/** Algo no caminho do microfone que aceita mudar o ganho na hora. */
export interface GainControl {
  setGain(gain: number): void
}

export class MicGainProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>, GainControl {
  readonly name = 'concord-mic-gain'
  processedTrack?: MediaStreamTrack

  private ctx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private gainNode: GainNode | null = null

  constructor(private gain = 1) {}

  async init({ track, audioContext }: AudioProcessorOptions): Promise<void> {
    this.ctx = audioContext
    const source = audioContext.createMediaStreamSource(new MediaStream([track]))
    const out = createMonoDestination(audioContext)
    const gainNode = audioContext.createGain()
    gainNode.gain.value = this.gain
    source.connect(gainNode).connect(out)
    this.source = source
    this.gainNode = gainNode
    this.processedTrack = out.stream.getAudioTracks()[0]
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy()
    await this.init(opts)
  }

  async destroy(): Promise<void> {
    this.source?.disconnect()
    this.gainNode?.disconnect()
    this.source = this.gainNode = null
    this.processedTrack = undefined
  }

  setGain(gain: number): void {
    this.gain = clampMicGain(gain)
    if (this.ctx && this.gainNode) this.gainNode.gain.setTargetAtTime(this.gain, this.ctx.currentTime, 0.02)
  }
}
