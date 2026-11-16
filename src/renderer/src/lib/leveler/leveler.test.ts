import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceLeveler } from './leveler'
import { LEVELER_GAIN_MAX } from './level'

class FakeNode {
  connected: unknown[] = []
  connect = vi.fn((target: unknown) => {
    this.connected.push(target)
    return target
  })
  disconnect = vi.fn()
}

class FakeAnalyser extends FakeNode {
  fftSize = 0
  amplitude = 0
  getFloatTimeDomainData = vi.fn((buf: Float32Array) => {
    for (let i = 0; i < buf.length; i++) buf[i] = this.amplitude * Math.sin((2 * Math.PI * i) / 48)
  })
}

class FakeGain extends FakeNode {
  gain = { value: 1, setTargetAtTime: vi.fn((v: number) => (this.gain.value = v)) }
}

class FakeContext {
  currentTime = 0
  destination = { name: 'destino' }
  sources: { stream: unknown; node: FakeNode }[] = []
  analysers: FakeAnalyser[] = []
  gains: FakeGain[] = []
  close = vi.fn(async () => {})
  resume = vi.fn(async () => {})
  setSinkId = vi.fn(async (_id: string) => {})
  createMediaStreamSource(stream: unknown): FakeNode {
    const node = new FakeNode()
    this.sources.push({ stream, node })
    return node
  }
  createAnalyser(): FakeAnalyser {
    const node = new FakeAnalyser()
    this.analysers.push(node)
    return node
  }
  createGain(): FakeGain {
    const node = new FakeGain()
    this.gains.push(node)
    return node
  }
}

let contexts: FakeContext[]
let tick: (() => void) | null
let cleared: number
let gains: Record<string, number>[]
let leveler: VoiceLeveler

const ctx = (): FakeContext => contexts[contexts.length - 1]
const mediaTrack = (id: string): MediaStreamTrack => ({ id }) as unknown as MediaStreamTrack
const run = (times: number): void => {
  for (let i = 0; i < times; i++) tick?.()
}

beforeEach(() => {
  contexts = []
  tick = null
  cleared = 0
  gains = []
  leveler = new VoiceLeveler({
    createContext: () => {
      const c = new FakeContext()
      contexts.push(c)
      return c as unknown as AudioContext
    },
    createStream: (track) => ({ tracks: [track] }) as unknown as MediaStream,
    setInterval: (fn) => {
      tick = fn
      return 1
    },
    clearInterval: () => {
      tick = null
      cleared++
    }
  })
  leveler.onGainsChange = (g) => gains.push(g)
})

describe('VoiceLeveler', () => {
  it('liga a voz: fonte → analisador → ganho → saída', () => {
    const key = {}
    leveler.add(key, 'acc-ana', mediaTrack('t1'))
    const c = ctx()
    expect(c.sources[0].stream).toEqual({ tracks: [{ id: 't1' }] })
    expect(c.sources[0].node.connected).toEqual([c.analysers[0]])
    expect(c.analysers[0].connected).toEqual([c.gains[0]])
    expect(c.gains[0].connected).toEqual([c.destination])
    expect(c.resume).toHaveBeenCalled()
  })

  it('um contexto só para todas as vozes, e o laço só roda com alguém', () => {
    expect(tick).toBeNull()
    leveler.add({}, 'acc-ana', mediaTrack('t1'))
    leveler.add({}, 'acc-bia', mediaTrack('t2'))
    expect(contexts).toHaveLength(1)
    expect(tick).not.toBeNull()
  })

  it('voz baixa sobe e voz alta desce até o alvo, e avisa o ganho de cada conta', () => {
    leveler.add({}, 'acc-baixa', mediaTrack('t1'))
    leveler.add({}, 'acc-alta', mediaTrack('t2'))
    const [baixa, alta] = ctx().analysers
    baixa.amplitude = 0.03
    alta.amplitude = 0.5
    run(300)
    const last = gains[gains.length - 1]
    expect(last['acc-baixa']).toBeGreaterThan(1.5)
    expect(last['acc-alta']).toBeLessThan(0.5)
    expect(ctx().gains[0].gain.value).toBeCloseTo(last['acc-baixa'], 1)
  })

  it('o ganho aplicado multiplica o volume pedido (pessoa × saída × ensurdecer)', () => {
    const key = {}
    leveler.add(key, 'acc-ana', mediaTrack('t1'))
    ctx().analysers[0].amplitude = 0.03
    run(300)
    const auto = gains[gains.length - 1]['acc-ana']
    leveler.setVolume(key, 0.5)
    expect(ctx().gains[0].gain.value).toBeCloseTo(auto * 0.5, 1)
    leveler.setVolume(key, 0)
    expect(ctx().gains[0].gain.value).toBe(0)
    run(5)
    expect(ctx().gains[0].gain.value).toBe(0)
  })

  it('volume pedido antes de medir já vale', () => {
    const key = {}
    leveler.add(key, 'acc-ana', mediaTrack('t1'), 0.4)
    expect(ctx().gains[0].gain.value).toBe(0.4)
  })

  it('alvo mais alto pede mais ganho', () => {
    const run2 = (target: 'low' | 'high'): number => {
      leveler.setTarget(target)
      const key = {}
      leveler.add(key, 'acc-ana', mediaTrack('t1'))
      ctx().analysers[ctx().analysers.length - 1].amplitude = 0.1
      run(300)
      const g = gains[gains.length - 1]['acc-ana']
      leveler.remove(key)
      return g
    }
    expect(run2('high')).toBeGreaterThan(run2('low'))
  })

  it('silêncio não muda o ganho', () => {
    leveler.add({}, 'acc-ana', mediaTrack('t1'))
    run(50)
    expect(ctx().gains[0].gain.value).toBe(1)
    expect(gains).toEqual([])
  })

  it('não passa do máximo', () => {
    leveler.add({}, 'acc-ana', mediaTrack('t1'))
    ctx().analysers[0].amplitude = 0.005
    run(600)
    expect(gains[gains.length - 1]['acc-ana']).toBeLessThanOrEqual(LEVELER_GAIN_MAX)
  })

  it('remove desliga os nós, para o laço sem ninguém e tira a conta do aviso', () => {
    const key = {}
    leveler.add(key, 'acc-ana', mediaTrack('t1'))
    ctx().analysers[0].amplitude = 0.03
    run(20)
    leveler.remove(key)
    expect(ctx().sources[0].node.disconnect).toHaveBeenCalled()
    expect(ctx().gains[0].disconnect).toHaveBeenCalled()
    expect(tick).toBeNull()
    expect(gains[gains.length - 1]).toEqual({})
  })

  it('saída escolhida vale para o contexto (agora e ao criar)', () => {
    leveler.setOutput('fone')
    leveler.add({}, 'acc-ana', mediaTrack('t1'))
    expect(ctx().setSinkId).toHaveBeenLastCalledWith('fone')
    leveler.setOutput(null)
    expect(ctx().setSinkId).toHaveBeenLastCalledWith('')
  })

  it('destroy fecha o contexto e para o laço', () => {
    leveler.add({}, 'acc-ana', mediaTrack('t1'))
    const c = ctx()
    leveler.destroy()
    expect(c.close).toHaveBeenCalled()
    expect(cleared).toBe(1)
    leveler.add({}, 'acc-bia', mediaTrack('t2'))
    expect(contexts).toHaveLength(2)
  })
})
