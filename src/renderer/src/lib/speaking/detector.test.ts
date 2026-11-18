import { describe, expect, it, vi } from 'vitest'
import { SPEAKING_HOLD_MS } from './speaking'
import { SPEAKING_TICK_MS, SpeakingDetector } from './detector'

const LOUD = 0.1
const BETWEEN = 0.002
const QUIET = 0.0001

class FakeNode {
  connected: unknown[] = []
  disconnect = vi.fn()
  connect(node: unknown): unknown {
    this.connected.push(node)
    return node
  }
}

class FakeAnalyser extends FakeNode {
  fftSize = 0
  constructor(private readonly amplitudeOf: () => number) {
    super()
  }
  getFloatTimeDomainData(samples: Float32Array): void {
    samples.fill(this.amplitudeOf())
  }
}

function setup() {
  const amplitudes = new Map<MediaStreamTrack, number>()
  const sources: Array<FakeNode & { track: MediaStreamTrack }> = []
  const contexts: Array<{ close: ReturnType<typeof vi.fn> }> = []
  const timer = { fn: null as (() => void) | null, cleared: 0 }

  const detector = new SpeakingDetector({
    createContext: () => {
      let lastTrack: MediaStreamTrack | null = null
      const ctx = {
        close: vi.fn(async () => {}),
        resume: vi.fn(async () => {}),
        createMediaStreamSource: (stream: { track: MediaStreamTrack }) => {
          lastTrack = stream.track
          const source = Object.assign(new FakeNode(), { track: stream.track })
          sources.push(source)
          return source
        },
        createAnalyser: () => {
          const track = lastTrack!
          return new FakeAnalyser(() => amplitudes.get(track) ?? 0)
        }
      }
      contexts.push(ctx)
      return ctx as unknown as AudioContext
    },
    createStream: (track) => ({ track }) as unknown as MediaStream,
    setInterval: (fn) => {
      timer.fn = fn
      return 1
    },
    clearInterval: () => {
      timer.fn = null
      timer.cleared++
    }
  })
  const changes: string[][] = []
  detector.onChange = (ids) => changes.push(ids)
  const tick = (times = 1): void => {
    for (let i = 0; i < times; i++) timer.fn?.()
  }
  const track = (name: string, amplitude = 0): MediaStreamTrack => {
    const t = { id: name } as MediaStreamTrack
    amplitudes.set(t, amplitude)
    return t
  }
  const setLevel = (t: MediaStreamTrack, amplitude: number): void => void amplitudes.set(t, amplitude)
  return { detector, changes, tick, track, setLevel, sources, contexts, timer }
}

const HOLD_TICKS = SPEAKING_HOLD_MS / SPEAKING_TICK_MS

describe('SpeakingDetector', () => {
  it('voz alta acende; silêncio apaga depois do tempo de espera', () => {
    const { detector, changes, tick, track, setLevel } = setup()
    const ana = track('ana', LOUD)
    detector.watch('ana', () => ana)
    tick()
    expect(changes).toEqual([['ana']])

    setLevel(ana, QUIET)
    tick(HOLD_TICKS - 1)
    expect(changes).toHaveLength(1)
    tick()
    expect(changes.at(-1)).toEqual([])
  })

  it('voz baixa entre os limiares mantém quem já falava e não acende quem estava quieto', () => {
    const { detector, changes, tick, track, setLevel } = setup()
    const ana = track('ana', LOUD)
    const bia = track('bia', BETWEEN)
    detector.watch('ana', () => ana)
    detector.watch('bia', () => bia)
    tick()
    setLevel(ana, BETWEEN)
    tick(HOLD_TICKS * 3)
    expect(changes).toEqual([['ana']])
  })

  it('acompanha a troca da faixa (microfone trocado, filtro ligado): mede a nova e solta a antiga', () => {
    const { detector, changes, tick, track, sources } = setup()
    const before = track('cru', QUIET)
    const after = track('filtrado', LOUD)
    let current = before
    detector.watch('eu', () => current)
    tick()
    expect(changes).toEqual([])

    current = after
    tick()
    expect(changes).toEqual([['eu']])
    expect(sources[0]?.disconnect).toHaveBeenCalled()
    expect(sources[1]?.track).toBe(after)
  })

  it('sem faixa (sem microfone) conta como silêncio e não abre o AudioContext', () => {
    const { detector, changes, tick, contexts } = setup()
    detector.watch('eu', () => null)
    tick(5)
    expect(changes).toEqual([])
    expect(contexts).toHaveLength(0)
  })

  it('parar de acompanhar quem falava apaga na hora e para o relógio quando não sobra ninguém', () => {
    const { detector, changes, tick, track, sources, timer } = setup()
    const ana = track('ana', LOUD)
    detector.watch('ana', () => ana)
    tick()
    detector.unwatch('ana')
    expect(changes.at(-1)).toEqual([])
    expect(sources[0]?.disconnect).toHaveBeenCalled()
    expect(timer.fn).toBeNull()
  })

  it('não avisa quando nada mudou', () => {
    const { detector, changes, tick, track } = setup()
    const ana = track('ana', LOUD)
    detector.watch('ana', () => ana)
    tick(10)
    expect(changes).toHaveLength(1)
  })

  it('destroy solta tudo, para o relógio e fecha o AudioContext', () => {
    const { detector, tick, track, sources, contexts, timer } = setup()
    const ana = track('ana', LOUD)
    detector.watch('ana', () => ana)
    tick()
    detector.destroy()
    expect(sources[0]?.disconnect).toHaveBeenCalled()
    expect(timer.cleared).toBe(1)
    expect(contexts[0]?.close).toHaveBeenCalled()
  })
})
