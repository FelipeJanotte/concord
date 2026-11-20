import { describe, expect, it, vi } from 'vitest'
import { MicLevelMonitor } from './mic-level'

function setup(opts: { openFails?: boolean } = {}) {
  const trackStop = vi.fn()
  const stream = { getTracks: () => [{ stop: trackStop }] }
  const analyser = {
    fftSize: 0,
    amplitude: 0,
    getFloatTimeDomainData(buf: Float32Array) {
      buf.fill(this.amplitude)
    }
  }
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const ctx = { createMediaStreamSource: vi.fn(() => source), createAnalyser: () => analyser, close: vi.fn(async () => {}) }
  let tick: (() => void) | null = null
  const openMic = vi.fn(async () => {
    if (opts.openFails) throw new Error('sem permissão')
    return stream as unknown as MediaStream
  })
  const monitor = new MicLevelMonitor({
    openMic,
    createAudioContext: () => ctx as unknown as AudioContext,
    setInterval: (fn) => {
      tick = fn
      return 1
    },
    clearInterval: () => {
      tick = null
    }
  })
  return { monitor, openMic, analyser, source, ctx, trackStop, tick: () => tick?.(), hasTimer: () => tick !== null }
}

describe('MicLevelMonitor', () => {
  it('abre o microfone escolhido e avisa o nível em dBFS', async () => {
    const s = setup()
    const levels: number[] = []
    await s.monitor.start('mic-usb', (db) => levels.push(db))
    expect(s.openMic).toHaveBeenCalledWith('mic-usb')
    expect(s.source.connect).toHaveBeenCalledWith(s.analyser)
    s.analyser.amplitude = 0.1
    s.tick()
    expect(levels[0]).toBeCloseTo(-20, 1)
  })

  it('stop fecha a captura, o contexto e para de medir', async () => {
    const s = setup()
    await s.monitor.start(null, () => {})
    s.monitor.stop()
    expect(s.trackStop).toHaveBeenCalled()
    expect(s.ctx.close).toHaveBeenCalled()
    expect(s.hasTimer()).toBe(false)
  })

  it('stop antes do microfone abrir solta a captura assim que ela chega', async () => {
    const s = setup()
    const started = s.monitor.start(null, () => {})
    s.monitor.stop()
    await started
    expect(s.trackStop).toHaveBeenCalled()
    expect(s.hasTimer()).toBe(false)
  })

  it('start de novo troca a captura anterior', async () => {
    const s = setup()
    await s.monitor.start('a', () => {})
    await s.monitor.start('b', () => {})
    expect(s.trackStop).toHaveBeenCalledTimes(1)
    expect(s.openMic).toHaveBeenLastCalledWith('b')
  })

  it('microfone que não abre não quebra', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = setup({ openFails: true })
    await expect(s.monitor.start(null, () => {})).resolves.toBeUndefined()
    expect(s.hasTimer()).toBe(false)
    warn.mockRestore()
  })
})
