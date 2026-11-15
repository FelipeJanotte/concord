// Supressão de ruído automática (B13): decisão pura (NoiseDecider) e o processador com Web Audio falso.
import { describe, expect, it, vi } from 'vitest'
import { Track, type AudioProcessorOptions } from 'livekit-client'
import { NoiseDecider, rmsToDb } from './decide'
import { AutoNoiseProcessor, MIN_CORES, type NoiseMode } from './processor'

describe('rmsToDb', () => {
  it('converte para dBFS com piso em -100', () => {
    expect(rmsToDb(1)).toBe(0)
    expect(rmsToDb(0.1)).toBeCloseTo(-20)
    expect(rmsToDb(0)).toBe(-100)
    expect(rmsToDb(1e-9)).toBe(-100)
  })
})

describe('NoiseDecider', () => {
  const opts = { noisyDb: -50, quietDb: -58, enterMs: 2000, exitMs: 10000, windowMs: 4000, percentile: 0.2 }

  /** Alimenta o decisor a cada 250 ms durante `ms` com o nível dado (ou uma função do tempo). */
  function feed(d: NoiseDecider, level: number | ((t: number) => number), from: number, ms: number): number {
    let t = from
    for (; t < from + ms; t += 250) d.update(typeof level === 'number' ? level : level(t), t)
    return t
  }

  it('ambiente silencioso: fica no filtro leve', () => {
    const d = new NoiseDecider(opts)
    feed(d, -70, 0, 20000)
    expect(d.isAdvanced).toBe(false)
  })

  it('ruído constante (ventilador) por 2 s liga o avançado', () => {
    const d = new NoiseDecider(opts)
    let t = feed(d, -70, 0, 4000)
    t = feed(d, -40, t, 4000) // a janela precisa "encher" de ruído e ficar assim por enterMs
    expect(d.isAdvanced).toBe(false) // ainda não: o fundo acabou de passar do limite
    t = feed(d, -40, t, 3000)
    expect(d.isAdvanced).toBe(true)
    expect(d.floorDb()).toBe(-40)
  })

  it('a fala sozinha (alta mas intermitente) não liga: o fundo é que conta', () => {
    const d = new NoiseDecider(opts)
    // fala 40% do tempo a -20 dB, silêncio de fundo a -70 dB
    feed(d, (t) => (Math.floor(t / 250) % 5 < 2 ? -20 : -70), 0, 30000)
    expect(d.isAdvanced).toBe(false)
    expect(d.floorDb()).toBe(-70)
  })

  it('fala por cima de ruído de fundo: liga (o fundo está alto)', () => {
    const d = new NoiseDecider(opts)
    feed(d, (t) => (Math.floor(t / 250) % 5 < 2 ? -20 : -42), 0, 15000)
    expect(d.isAdvanced).toBe(true)
  })

  it('desliga só depois de 10 s de silêncio (e não com um momento quieto)', () => {
    const d = new NoiseDecider(opts, true)
    let t = feed(d, -70, 0, 8000)
    expect(d.isAdvanced).toBe(true)
    t = feed(d, -70, t, 8000)
    expect(d.isAdvanced).toBe(false)
  })

  it('no vão entre os limites não troca (histerese)', () => {
    const on = new NoiseDecider(opts, true)
    const off = new NoiseDecider(opts, false)
    feed(on, -54, 0, 30000)
    feed(off, -54, 0, 30000)
    expect(on.isAdvanced).toBe(true)
    expect(off.isAdvanced).toBe(false)
  })

  it('um barulho curto no meio do silêncio não liga', () => {
    const d = new NoiseDecider(opts)
    let t = feed(d, -70, 0, 6000)
    t = feed(d, -30, t, 1000) // porta batendo
    feed(d, -70, t, 6000)
    expect(d.isAdvanced).toBe(false)
  })

  it('sem medições não decide', () => {
    expect(new NoiseDecider(opts).floorDb()).toBeNull()
  })
})

// ---------- processador ----------

class FakeParam {
  value = 0
  targets: [number, number][] = []
  setTargetAtTime(v: number, t: number): void {
    this.value = v
    this.targets.push([v, t])
  }
}

class FakeNode {
  connections: FakeNode[] = []
  disconnected = 0
  onprocessorerror: (() => void) | null = null
  constructor(readonly kind: string) {}
  connect<T extends FakeNode>(n: T): T {
    this.connections.push(n)
    return n
  }
  disconnect(): void {
    this.disconnected++
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam()
  constructor() {
    super('gain')
  }
}

class FakeAnalyser extends FakeNode {
  fftSize = 0
  level = 0
  constructor() {
    super('analyser')
  }
  getFloatTimeDomainData(buf: Float32Array): void {
    buf.fill(this.level)
  }
}

class FakeCtx {
  currentTime = 5
  gains: FakeGain[] = []
  analyser = new FakeAnalyser()
  outTrack = { id: 'processada' }
  createMediaStreamSource() {
    return new FakeNode('source')
  }
  createMediaStreamDestination() {
    const n = new FakeNode('destination') as FakeNode & { stream: { getAudioTracks: () => unknown[] } }
    n.stream = { getAudioTracks: () => [this.outTrack] }
    return n
  }
  createGain() {
    const g = new FakeGain()
    this.gains.push(g)
    return g
  }
  createAnalyser() {
    return this.analyser
  }
}

class FakeMediaStream {
  constructor(readonly tracks: unknown[]) {}
}

function setup(opts: { cores?: number; engineFails?: boolean } = {}) {
  vi.stubGlobal('MediaStream', FakeMediaStream)
  const ctx = new FakeCtx()
  const engineNode = new FakeNode('rnnoise')
  const destroyEngine = vi.fn()
  let tick: (() => void) | null = null
  let now = 0
  const modes: NoiseMode[] = []
  const track = { applyConstraints: vi.fn(async (_c: MediaTrackConstraints) => {}) }
  const proc = new AutoNoiseProcessor(
    {
      loadEngine: vi.fn(async () => {
        if (opts.engineFails) throw new Error('WASM bloqueado')
        return { node: engineNode as unknown as AudioNode, destroy: destroyEngine }
      }),
      cores: () => opts.cores ?? 8,
      now: () => now,
      setInterval: (fn) => {
        tick = fn
        return 1
      },
      clearInterval: vi.fn(() => {
        tick = null
      }),
      deciderOptions: { enterMs: 500, exitMs: 1000, windowMs: 1000 }
    },
    (m) => modes.push(m)
  )
  const init = (): Promise<void> =>
    proc.init({
      kind: Track.Kind.Audio,
      track: track as unknown as MediaStreamTrack,
      audioContext: ctx as unknown as AudioContext
    } as AudioProcessorOptions)
  /** Simula `ms` de áudio no nível dado (amplitude constante). */
  const run = (amplitude: number, ms: number): void => {
    ctx.analyser.level = amplitude
    for (let t = 0; t < ms; t += 250) {
      now += 250
      tick?.()
    }
  }
  const [dry, wet] = [() => ctx.gains[0], () => ctx.gains[1]]
  return { proc, ctx, engineNode, destroyEngine, modes, track, init, run, dry, wet, hasTimer: () => tick !== null }
}

describe('AutoNoiseProcessor', () => {
  it('volume do microfone: seco e molhado passam pelo ganho de volume antes da saída; setGain muda na hora', async () => {
    const s = setup()
    await s.init()
    const volume = s.ctx.gains[2]
    expect(volume.gain.value).toBe(1)
    expect(s.dry().connections).toEqual([volume])
    expect(s.wet().connections).toEqual([volume])
    expect(volume.connections.map((n) => n.kind)).toEqual(['destination'])
    s.proc.setGain(1.5)
    expect(volume.gain.value).toBe(1.5)
    s.proc.setGain(10)
    expect(volume.gain.value).toBe(2)
  })

  it('começa no leve (seco), gera a faixa processada e mede o ruído', async () => {
    const s = setup()
    await s.init()
    expect(s.proc.processedTrack).toBe(s.ctx.outTrack)
    expect(s.modes).toEqual(['light'])
    expect(s.dry().gain.value).toBe(1)
    expect(s.wet().gain.value).toBe(0)
    expect(s.hasTimer()).toBe(true)
  })

  it('ruído de fundo liga o avançado: crossfade para o molhado e desliga a supressão nativa', async () => {
    const s = setup()
    await s.init()
    s.run(0.03, 2000) // ≈ -30 dBFS constante
    expect(s.proc.currentMode).toBe('advanced')
    expect(s.dry().gain.value).toBe(0)
    expect(s.wet().gain.value).toBe(1)
    expect(s.track.applyConstraints).toHaveBeenLastCalledWith({ noiseSuppression: false })
  })

  it('o silêncio volta para o leve e religa a supressão nativa', async () => {
    const s = setup()
    await s.init()
    s.run(0.03, 2000)
    s.run(0.0001, 3000) // ≈ -80 dBFS
    expect(s.proc.currentMode).toBe('light')
    expect(s.dry().gain.value).toBe(1)
    expect(s.track.applyConstraints).toHaveBeenLastCalledWith({ noiseSuppression: true })
    expect(s.modes).toEqual(['light', 'advanced', 'light'])
  })

  it('motor que não carrega: fica no leve, sem medir nada', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = setup({ engineFails: true })
    await s.init()
    expect(s.modes).toEqual(['light-fallback'])
    expect(s.hasTimer()).toBe(false)
    expect(s.proc.processedTrack).toBe(s.ctx.outTrack) // a voz continua saindo
    warn.mockRestore()
  })

  it(`PC com menos de ${MIN_CORES} núcleos não usa o avançado`, async () => {
    const s = setup({ cores: 2 })
    await s.init()
    expect(s.modes).toEqual(['light-fallback'])
  })

  it('erro dentro do AudioWorklet: cai para o leve e para de medir', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = setup()
    await s.init()
    s.run(0.03, 2000)
    s.engineNode.onprocessorerror?.()
    expect(s.proc.currentMode).toBe('light-fallback')
    expect(s.dry().gain.value).toBe(1)
    expect(s.hasTimer()).toBe(false)
    warn.mockRestore()
  })

  it('destroy libera o motor, desconecta e devolve a supressão nativa', async () => {
    const s = setup()
    await s.init()
    s.run(0.03, 2000)
    await s.proc.destroy()
    expect(s.destroyEngine).toHaveBeenCalled()
    expect(s.hasTimer()).toBe(false)
    expect(s.proc.processedTrack).toBeUndefined()
    expect(s.track.applyConstraints).toHaveBeenLastCalledWith({ noiseSuppression: true })
  })

  it('applyConstraints recusado não quebra', async () => {
    const s = setup()
    s.track.applyConstraints.mockRejectedValue(new Error('OverconstrainedError'))
    await s.init()
    expect(() => s.run(0.03, 2000)).not.toThrow()
    expect(s.proc.currentMode).toBe('advanced')
  })
})
