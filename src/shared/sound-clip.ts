import { SOUND_MAX_DURATION_MS } from './types/sounds'

export const SOUND_CLIP_SAMPLE_RATE = 44_100

export interface DecodedAudio {
  sampleRate: number
  channels: Float32Array[]
}

export interface ClipWindow {
  startMs: number
  endMs: number
}

const WAV_HEADER_BYTES = 44
const BYTES_PER_SAMPLE = 2

export function decodedDurationMs(audio: DecodedAudio): number {
  return Math.round(((audio.channels[0]?.length ?? 0) / audio.sampleRate) * 1000)
}

export function maxClipStartMs(durationMs: number): number {
  return Math.max(0, durationMs - SOUND_MAX_DURATION_MS)
}

export function clipWindow(durationMs: number, startMs: number): ClipWindow {
  const start = Math.min(Math.max(0, startMs), maxClipStartMs(durationMs))
  return { startMs: start, endMs: Math.min(durationMs, start + SOUND_MAX_DURATION_MS) }
}

export function mixToMono(channels: Float32Array[]): Float32Array {
  const length = Math.min(...channels.map((c) => c.length))
  const mono = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    let sum = 0
    for (const channel of channels) sum += channel[i]
    mono[i] = sum / channels.length
  }
  return mono
}

function toInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample))
  return Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767)
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const dataBytes = samples.length * BYTES_PER_SAMPLE
  const wav = new Uint8Array(new ArrayBuffer(WAV_HEADER_BYTES + dataBytes))
  const view = new DataView(wav.buffer)
  const writeText = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) wav[offset + i] = value.charCodeAt(i)
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeText(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true)
  view.setUint16(32, BYTES_PER_SAMPLE, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, dataBytes, true)
  samples.forEach((sample, i) => view.setInt16(WAV_HEADER_BYTES + i * BYTES_PER_SAMPLE, toInt16(sample), true))
  return wav
}

export function clipToWav(audio: DecodedAudio, startMs: number): Uint8Array<ArrayBuffer> {
  const { startMs: start } = clipWindow(decodedDurationMs(audio), startMs)
  const from = Math.round((start / 1000) * audio.sampleRate)
  const to = from + Math.floor((SOUND_MAX_DURATION_MS / 1000) * audio.sampleRate)
  return encodeWav(mixToMono(audio.channels.map((c) => c.subarray(from, to))), audio.sampleRate)
}
