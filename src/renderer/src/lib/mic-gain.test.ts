// Volume do microfone e de saída: limites e o processador de volume do microfone.
import { Track, type AudioProcessorOptions } from 'livekit-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampMicGain, clampOutputVolume, MicGainProcessor } from './mic-gain'

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

class FakeMediaStream {
  constructor(readonly tracks: unknown[]) {}
}

function setup(gain?: number) {
  vi.stubGlobal('MediaStream', FakeMediaStream)
  const source = new FakeNode()
  const out = Object.assign(new FakeNode(), { stream: { getAudioTracks: () => [{ id: 'processada' }] } })
  const gainNode = new FakeGain()
  const ctx = { currentTime: 3, createMediaStreamSource: () => source, createMediaStreamDestination: () => out, createGain: () => gainNode }
  const proc = new MicGainProcessor(gain)
  const init = (): Promise<void> =>
    proc.init({ kind: Track.Kind.Audio, track: {} as MediaStreamTrack, audioContext: ctx as unknown as AudioContext } as AudioProcessorOptions)
  return { proc, source, out, gainNode, init }
}

afterEach(() => vi.unstubAllGlobals())

describe('MicGainProcessor', () => {
  it('liga microfone → ganho → saída, com o volume inicial, e entrega a faixa processada', async () => {
    const s = setup(1.5)
    await s.init()
    expect(s.source.connections).toEqual([s.gainNode])
    expect(s.gainNode.connections).toEqual([s.out])
    expect(s.gainNode.gain.value).toBe(1.5)
    expect(s.proc.processedTrack).toEqual({ id: 'processada' })
  })

  it('setGain muda na hora (com limite) e destroy desconecta', async () => {
    const s = setup()
    await s.init()
    expect(s.gainNode.gain.value).toBe(1)
    s.proc.setGain(5)
    expect(s.gainNode.gain.value).toBe(2)
    await s.proc.destroy()
    expect(s.source.disconnected).toBe(1)
    expect(s.gainNode.disconnected).toBe(1)
    expect(s.proc.processedTrack).toBeUndefined()
    s.proc.setGain(0.5) // depois de destruído não quebra
  })
})

describe('MicGainProcessor em mono', () => {
  it('a faixa processada sai com um canal', async () => {
    const s = setup()
    await s.init()
    const out = s.out as typeof s.out & { channelCount?: number; channelCountMode?: string }
    expect(out.channelCount).toBe(1)
    expect(out.channelCountMode).toBe('explicit')
  })
})
