// Áudios de teste gerados na hora (sem arquivos binários no repositório).

/**
 * WAV PCM válido com `seconds` de silêncio. 8 kHz, 8 bits, mono = 8 KB por segundo
 * (dá para fazer arquivos grandes aumentando `sampleRate`/`channels`).
 */
export function wav(seconds: number, { sampleRate = 8000, channels = 1, bits = 8 } = {}): Buffer {
  const bytesPerSample = bits / 8
  const dataSize = Math.round(seconds * sampleRate) * channels * bytesPerSample
  const b = Buffer.alloc(44 + dataSize, bits === 8 ? 0x80 : 0)
  b.write('RIFF', 0, 'latin1')
  b.writeUInt32LE(36 + dataSize, 4)
  b.write('WAVE', 8, 'latin1')
  b.write('fmt ', 12, 'latin1')
  b.writeUInt32LE(16, 16) // tamanho do bloco fmt
  b.writeUInt16LE(1, 20) // PCM
  b.writeUInt16LE(channels, 22)
  b.writeUInt32LE(sampleRate, 24)
  b.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  b.writeUInt16LE(channels * bytesPerSample, 32)
  b.writeUInt16LE(bits, 34)
  b.write('data', 36, 'latin1')
  b.writeUInt32LE(dataSize, 40)
  return b
}
