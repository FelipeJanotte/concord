/**
 * Áudio dos efeitos sonoros (A10): tipo pelos primeiros bytes (nunca pela extensão
 * ou pelo Content-Type do app) e duração lida do próprio arquivo (music-metadata).
 */
import type { SoundType } from '../../src/shared/types'

const ascii = (buf: Buffer, offset: number, text: string): boolean =>
  buf.length >= offset + text.length && buf.toString('latin1', offset, offset + text.length) === text

/** MP3, OGG, WAV ou WebM pelo cabeçalho; null se não for um deles. */
export function sniffAudio(head: Buffer): SoundType | null {
  if (ascii(head, 0, 'OggS')) return 'audio/ogg'
  if (ascii(head, 0, 'RIFF') && ascii(head, 8, 'WAVE')) return 'audio/wav'
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'audio/webm'
  if (ascii(head, 0, 'ID3')) return 'audio/mpeg'
  // quadro MPEG sem tag ID3: 11 bits de sincronia + layer válido (não 00)
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) !== 0) return 'audio/mpeg'
  return null
}

/** Duração em ms lida do arquivo, ou null se não der para ler (arquivo corrompido ou sem a informação). */
export async function audioDurationMs(data: Buffer, type: SoundType): Promise<number | null> {
  try {
    // music-metadata é só ESM: import dinâmico funciona tanto no tsx quanto no vitest
    const { parseBuffer } = await import('music-metadata')
    const meta = await parseBuffer(data, { mimeType: type, size: data.length }, { duration: true, skipCovers: true })
    const seconds = meta.format.duration
    return seconds && Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null
  } catch {
    return null
  }
}
