import { rmsDb } from './leveler/level'

export interface MicLevelDeps {
  openMic: (deviceId: string | null) => Promise<MediaStream>
  createAudioContext: () => AudioContext
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

interface Capture {
  stream: MediaStream
  ctx: AudioContext
  source: MediaStreamAudioSourceNode
  timer: unknown
}

const LEVEL_TICK_MS = 50

export class MicLevelMonitor {
  private capture: Capture | null = null
  private generation = 0

  constructor(private readonly deps: MicLevelDeps) {}

  async start(deviceId: string | null, onLevel: (db: number) => void): Promise<void> {
    this.stop()
    const generation = this.generation
    let stream: MediaStream
    try {
      stream = await this.deps.openMic(deviceId)
    } catch (err) {
      console.warn('[voz] não foi possível abrir o microfone para medir o nível:', err)
      return
    }
    if (generation !== this.generation) return stream.getTracks().forEach((t) => t.stop())
    const ctx = this.deps.createAudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    const buffer = new Float32Array(analyser.fftSize)
    source.connect(analyser)
    const timer = this.deps.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer)
      onLevel(rmsDb(buffer))
    }, LEVEL_TICK_MS)
    this.capture = { stream, ctx, source, timer }
  }

  stop(): void {
    this.generation++
    const capture = this.capture
    this.capture = null
    if (!capture) return
    this.deps.clearInterval(capture.timer)
    capture.source.disconnect()
    capture.stream.getTracks().forEach((t) => t.stop())
    void capture.ctx.close().catch(() => {})
  }
}

export const micLevelMonitor = new MicLevelMonitor({
  openMic: (deviceId) =>
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) }
    }),
  createAudioContext: () => new AudioContext(),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id as number)
})
