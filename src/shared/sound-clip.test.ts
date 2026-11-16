import { describe, expect, it } from 'vitest'
import { audioDurationMs, sniffAudio } from '../../server/storage/audio'
import { clipToWav, clipWindow, decodedDurationMs, encodeWav, mixToMono, SOUND_CLIP_SAMPLE_RATE } from './sound-clip'
import { SOUND_MAX_BYTES, SOUND_MAX_DURATION_MS } from './types/sounds'

const ramp = (length: number): Float32Array => Float32Array.from({ length }, (_, i) => i / length)
const view = (wav: Uint8Array): DataView => new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
const text = (wav: Uint8Array, offset: number, length: number): string => String.fromCharCode(...wav.subarray(offset, offset + length))

describe('clipWindow', () => {
  it('trecho de 5 s a partir do início escolhido', () => {
    expect(clipWindow(12_000, 3000)).toEqual({ startMs: 3000, endMs: 8000 })
  })

  it('início além do possível encosta no fim do áudio', () => {
    expect(clipWindow(12_000, 10_000)).toEqual({ startMs: 7000, endMs: 12_000 })
  })

  it('início negativo vira zero', () => {
    expect(clipWindow(12_000, -500)).toEqual({ startMs: 0, endMs: 5000 })
  })

  it('áudio curto usa o áudio inteiro', () => {
    expect(clipWindow(3000, 1000)).toEqual({ startMs: 0, endMs: 3000 })
  })
})

describe('decodedDurationMs', () => {
  it('duração pelo número de amostras', () => {
    expect(decodedDurationMs({ sampleRate: 1000, channels: [new Float32Array(12_345)] })).toBe(12_345)
  })
})

describe('mixToMono', () => {
  it('média dos canais', () => {
    expect(Array.from(mixToMono([Float32Array.from([1, 0.5]), Float32Array.from([0, -0.5])]))).toEqual([0.5, 0])
  })

  it('um canal fica igual', () => {
    expect(Array.from(mixToMono([Float32Array.from([0.25, -1])]))).toEqual([0.25, -1])
  })
})

describe('encodeWav', () => {
  it('cabeçalho PCM 16 bits mono', () => {
    const wav = encodeWav(new Float32Array(10), 22_050)
    const v = view(wav)
    expect(wav.byteLength).toBe(44 + 20)
    expect(text(wav, 0, 4)).toBe('RIFF')
    expect(v.getUint32(4, true)).toBe(36 + 20)
    expect(text(wav, 8, 8)).toBe('WAVEfmt ')
    expect(v.getUint32(16, true)).toBe(16)
    expect(v.getUint16(20, true)).toBe(1)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(22_050)
    expect(v.getUint32(28, true)).toBe(44_100)
    expect(v.getUint16(32, true)).toBe(2)
    expect(v.getUint16(34, true)).toBe(16)
    expect(text(wav, 36, 4)).toBe('data')
    expect(v.getUint32(40, true)).toBe(20)
  })

  it('amostras convertidas e limitadas a -1..1', () => {
    const v = view(encodeWav(Float32Array.from([0, 1, -1, 2, -3, 0.5]), 8000))
    expect([0, 1, 2, 3, 4, 5].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767, -32768, 16384])
  })
})

describe('clipToWav', () => {
  it('pega as amostras do trecho escolhido, em mono', () => {
    const left = ramp(8000)
    const right = ramp(8000)
    const wav = clipToWav({ sampleRate: 1000, channels: [left, right] }, 2000)
    const v = view(wav)
    expect(v.getUint32(40, true)).toBe(5000 * 2)
    expect(v.getInt16(44, true)).toBe(Math.round(left[2000] * 32767))
    expect(v.getInt16(44 + 4999 * 2, true)).toBe(Math.round(left[6999] * 32767))
  })

  it('o trecho de 5 s de um áudio longo e estéreo passa nas regras do servidor', async () => {
    const seconds = 12
    const channel = ramp(seconds * SOUND_CLIP_SAMPLE_RATE)
    const wav = Buffer.from(clipToWav({ sampleRate: SOUND_CLIP_SAMPLE_RATE, channels: [channel, channel] }, 3000))
    expect(wav.byteLength).toBeLessThanOrEqual(SOUND_MAX_BYTES)
    expect(sniffAudio(wav)).toBe('audio/wav')
    expect(await audioDurationMs(wav, 'audio/wav')).toBe(SOUND_MAX_DURATION_MS)
  })
})
