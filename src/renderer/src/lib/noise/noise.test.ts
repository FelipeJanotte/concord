import { afterEach, describe, expect, it, vi } from 'vitest'
import { Track, type AudioProcessorOptions } from 'livekit-client'
import { AutoNoiseProcessor, MIN_CORES, type NoiseMode } from './processor'

class FakeParam {
  value = 0
  setTargetAtTime(v: number): void {
    this.value = v
  }
}

class FakeNode {
  connections: FakeNode[] = []
  disconnected = 0
  onprocessorerror: (() => void) | null = null
  channelCount?: number
  channelCountMode?: string
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
  amplitude = 0
  constructor() {
    super('analyser')
  }
  getFloatTimeDomainData(buf: Float32Array): void {
    buf.fill(this.amplitude)
  }
}

class FakeCtx {
  analyser = new FakeAnalyser()
  createAnalyser() {
    return this.analyser
  }
  currentTime = 5
  gains: FakeGain[] = []
  outTrack = { id: 'processada' }
  destination: FakeNode | null = null
  createMediaStreamSource() {
    return new FakeNode('source')
  }
  createMediaStreamDestination() {
    const n = new FakeNode('destination') as FakeNode & { stream: { getAudioTracks: () => unknown[] } }
    n.stream = { getAudioTracks: () => [this.outTrack] }
    this.destination = n
    return n
  }
  createGain() {
    const g = new FakeGain()
    this.gains.push(g)
    return g
  }
}

class FakeMediaStream {
  constructor(readonly tracks: unknown[]) {}
}

afterEach(() => vi.unstubAllGlobals())

function setup(opts: { cores?: number; engineFails?: boolean; sensitivityDb?: number } = {}) {
  vi.stubGlobal('MediaStream', FakeMediaStream)
  const ctx = new FakeCtx()
  const engineNode = new FakeNode('rnnoise')
  const destroyEngine = vi.fn()
  const modes: NoiseMode[] = []
  const levels: number[] = []
  let tick: (() => void) | null = null
  let now = 0
  const proc = new AutoNoiseProcessor(
    {
      loadEngine: vi.fn(async () => {
        if (opts.engineFails) throw new Error('WASM bloqueado')
        return { node: engineNode as unknown as AudioNode, destroy: destroyEngine }
      }),
      cores: () => opts.cores ?? 8
    },
    (m) => modes.push(m),
    {
      gain: 1,
      sensitivityDb: opts.sensitivityDb ?? -60,
      onLevel: (db) => levels.push(db),
      clock: {
        now: () => now,
        setInterval: (fn) => {
          tick = fn
          return 1
        },
        clearInterval: () => {
          tick = null
        }
      }
    }
  )
  const run = (amplitude: number, ms: number): void => {
    ctx.analyser.amplitude = amplitude
    for (let t = 0; t < ms; t += 50) {
      now += 50
      tick?.()
    }
  }
  const init = (): Promise<void> =>
    proc.init({
      kind: Track.Kind.Audio,
      track: {} as MediaStreamTrack,
      audioContext: ctx as unknown as AudioContext
    } as AudioProcessorOptions)
  const dry = (): FakeGain => ctx.gains[0]
  const wet = (): FakeGain => ctx.gains[1]
  const gate = (): FakeGain => ctx.gains[3]
  return { proc, ctx, engineNode, destroyEngine, modes, levels, init, run, dry, wet, gate, hasTimer: () => tick !== null }
}

describe('AutoNoiseProcessor', () => {
  it('volume do microfone: seco e molhado passam pelo ganho de volume antes da saída; setGain muda na hora', async () => {
    const s = setup()
    await s.init()
    const volume = s.ctx.gains[2]
    expect(volume.gain.value).toBe(1)
    expect(s.dry().connections).toEqual([volume])
    expect(s.wet().connections).toEqual([volume])
    expect(volume.connections).toEqual([s.gate(), s.ctx.analyser])
    expect(s.gate().connections.map((n) => n.kind)).toEqual(['destination'])
    s.proc.setGain(1.5)
    expect(volume.gain.value).toBe(1.5)
    s.proc.setGain(10)
    expect(volume.gain.value).toBe(2)
  })

  it('com o motor carregado, o RNNoise fica ligado desde o início', async () => {
    const s = setup()
    await s.init()
    expect(s.proc.processedTrack).toBe(s.ctx.outTrack)
    expect(s.modes).toEqual(['advanced'])
    expect(s.dry().gain.value).toBe(0)
    expect(s.wet().gain.value).toBe(1)
  })

  it('motor que não carrega: fica no nativo, com a voz passando seca', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = setup({ engineFails: true })
    await s.init()
    expect(s.modes).toEqual(['light-fallback'])
    expect(s.dry().gain.value).toBe(1)
    expect(s.proc.processedTrack).toBe(s.ctx.outTrack)
    warn.mockRestore()
  })

  it(`PC com menos de ${MIN_CORES} núcleos não usa o RNNoise`, async () => {
    const s = setup({ cores: 2 })
    await s.init()
    expect(s.modes).toEqual(['light-fallback'])
    expect(s.dry().gain.value).toBe(1)
  })

  it('erro dentro do AudioWorklet: cai para o nativo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = setup()
    await s.init()
    s.engineNode.onprocessorerror?.()
    expect(s.proc.currentMode).toBe('light-fallback')
    expect(s.dry().gain.value).toBe(1)
    expect(s.wet().gain.value).toBe(0)
    warn.mockRestore()
  })

  it('destroy libera o motor e desconecta', async () => {
    const s = setup()
    await s.init()
    await s.proc.destroy()
    expect(s.destroyEngine).toHaveBeenCalled()
    expect(s.proc.processedTrack).toBeUndefined()
  })
})

describe('AutoNoiseProcessor com sensibilidade', () => {
  it('mede depois do RNNoise e do volume, corta abaixo da linha e abre acima', async () => {
    const s = setup({ sensitivityDb: -40 })
    await s.init()
    s.run(0.001, 100)
    expect(s.gate().gain.value).toBe(0)
    s.run(0.1, 50)
    expect(s.gate().gain.value).toBe(1)
    expect(s.levels.at(-1)).toBeCloseTo(-20, 1)
  })

  it('setSensitivity muda a linha na hora; destroy para de medir', async () => {
    const s = setup({ sensitivityDb: -20 })
    await s.init()
    s.run(0.01, 50)
    expect(s.gate().gain.value).toBe(0)
    s.proc.setSensitivity(-60)
    s.run(0.01, 50)
    expect(s.gate().gain.value).toBe(1)
    await s.proc.destroy()
    expect(s.hasTimer()).toBe(false)
  })
})

describe('AutoNoiseProcessor em mono', () => {
  it('microfone estéreo vira mono antes do RNNoise e a faixa processada sai com um canal', async () => {
    const s = setup()
    await s.init()
    expect(s.engineNode.channelCount).toBe(1)
    expect(s.engineNode.channelCountMode).toBe('explicit')
    expect(s.ctx.destination?.channelCount).toBe(1)
    expect(s.ctx.destination?.channelCountMode).toBe('explicit')
  })

  it('sem o RNNoise, a faixa processada também sai com um canal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = setup({ engineFails: true })
    await s.init()
    expect(s.ctx.destination?.channelCount).toBe(1)
    warn.mockRestore()
  })
})
