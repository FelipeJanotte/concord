import { Track, type AudioProcessorOptions } from 'livekit-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampMicGain, clampOutputVolume, MicGainProcessor } from './mic-gain'
import { GATE_HOLD_MS } from './mic-gate'

describe('limites', () => {
  it('microfone de 0 a 2; inválido volta a 1', () => {
    expect(clampMicGain(1.5)).toBe(1.5)
    expect(clampMicGain(3)).toBe(2)
    expect(clampMicGain(-1)).toBe(0)
    expect(clampMicGain(Number.NaN)).toBe(1)
    expect(clampMicGain('2')).toBe(1)
    expect(clampMicGain(undefined)).toBe(1)
  })

  it('saída de 0 a 1; inválido volta a 1', () => {
    expect(clampOutputVolume(0.4)).toBe(0.4)
    expect(clampOutputVolume(1.5)).toBe(1)
    expect(clampOutputVolume(-0.1)).toBe(0)
    expect(clampOutputVolume(null)).toBe(1)
  })

})

class FakeNode {
  connections: FakeNode[] = []
  disconnected = 0
  channelCount?: number
  channelCountMode?: string
  connect<T extends FakeNode>(n: T): T {
    this.connections.push(n)
    return n
  }
  disconnect(): void {
    this.disconnected++
  }
}

class FakeParam {
  value = 0
  setTargetAtTime(v: number): void {
    this.value = v
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam()
}

class FakeAnalyser extends FakeNode {
  fftSize = 0
  amplitude = 0
  getFloatTimeDomainData(buf: Float32Array): void {
    buf.fill(this.amplitude)
  }
}

class FakeMediaStream {
  constructor(readonly tracks: unknown[]) {}
}

function setup(opts: { gain?: number; sensitivityDb?: number } = {}) {
  vi.stubGlobal('MediaStream', FakeMediaStream)
  const source = new FakeNode()
  const out = Object.assign(new FakeNode(), { stream: { getAudioTracks: () => [{ id: 'processada' }] } })
  const gains: FakeGain[] = []
  const analyser = new FakeAnalyser()
  const ctx = {
    currentTime: 3,
    createMediaStreamSource: () => source,
    createMediaStreamDestination: () => out,
    createGain: () => {
      const g = new FakeGain()
      gains.push(g)
      return g
    },
    createAnalyser: () => analyser
  }
  let tick: (() => void) | null = null
  let now = 0
  const levels: number[] = []
  const proc = new MicGainProcessor({
    gain: opts.gain ?? 1,
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
  })
  const init = (): Promise<void> =>
    proc.init({ kind: Track.Kind.Audio, track: {} as MediaStreamTrack, audioContext: ctx as unknown as AudioContext } as AudioProcessorOptions)
  const run = (amplitude: number, ms: number): void => {
    analyser.amplitude = amplitude
    for (let t = 0; t < ms; t += 50) {
      now += 50
      tick?.()
    }
  }
  return { proc, source, out, analyser, init, run, levels, gainNode: () => gains[0], gate: () => gains[1], hasTimer: () => tick !== null }
}

afterEach(() => vi.unstubAllGlobals())

describe('MicGainProcessor', () => {
  it('liga microfone → volume → portão → saída, mede depois do volume e entrega a faixa processada', async () => {
    const s = setup({ gain: 1.5 })
    await s.init()
    expect(s.source.connections).toEqual([s.gainNode()])
    expect(s.gainNode().connections).toEqual([s.gate(), s.analyser])
    expect(s.gate().connections).toEqual([s.out])
    expect(s.gainNode().gain.value).toBe(1.5)
    expect(s.proc.processedTrack).toEqual({ id: 'processada' })
  })

  it('setGain muda na hora (com limite) e destroy desconecta e para de medir', async () => {
    const s = setup()
    await s.init()
    s.proc.setGain(5)
    expect(s.gainNode().gain.value).toBe(2)
    await s.proc.destroy()
    expect(s.source.disconnected).toBe(1)
    expect(s.gainNode().disconnected).toBe(1)
    expect(s.hasTimer()).toBe(false)
    expect(s.proc.processedTrack).toBeUndefined()
    s.proc.setGain(0.5)
  })
})

describe('MicGainProcessor com sensibilidade', () => {
  it('som abaixo da linha fica cortado; acima abre', async () => {
    const s = setup({ sensitivityDb: -40 })
    await s.init()
    expect(s.gate().gain.value).toBe(0)
    s.run(0.001, 200)
    expect(s.gate().gain.value).toBe(0)
    s.run(0.1, 50)
    expect(s.gate().gain.value).toBe(1)
  })

  it('fecha depois da espera quando o som cai', async () => {
    const s = setup({ sensitivityDb: -40 })
    await s.init()
    s.run(0.1, 50)
    s.run(0.001, GATE_HOLD_MS - 50)
    expect(s.gate().gain.value).toBe(1)
    s.run(0.001, 100)
    expect(s.gate().gain.value).toBe(0)
  })

  it('setSensitivity muda a linha na hora', async () => {
    const s = setup({ sensitivityDb: -20 })
    await s.init()
    s.run(0.01, 50)
    expect(s.gate().gain.value).toBe(0)
    s.proc.setSensitivity(-60)
    s.run(0.01, 50)
    expect(s.gate().gain.value).toBe(1)
  })

  it('avisa o nível medido em dBFS a cada medição', async () => {
    const s = setup()
    await s.init()
    s.run(0.1, 100)
    expect(s.levels).toHaveLength(2)
    expect(s.levels[0]).toBeCloseTo(-20, 1)
  })
})

describe('MicGainProcessor em mono', () => {
  it('a faixa processada sai com um canal', async () => {
    const s = setup()
    await s.init()
    expect(s.out.channelCount).toBe(1)
    expect(s.out.channelCountMode).toBe('explicit')
  })
})
