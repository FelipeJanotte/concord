/**
 * Descobre o tipo de imagem pelos primeiros bytes (nunca pela extensão ou pelo
 * Content-Type que o app mandou) e lê largura/altura do cabeçalho.
 * Só PNG, JPEG, GIF e WebP são reconhecidos: são os únicos mostrados no chat.
 */

export interface ImageInfo {
  contentType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  width: number | null
  height: number | null
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b)

const ascii = (buf: Buffer, offset: number, text: string): boolean =>
  buf.length >= offset + text.length && buf.toString('latin1', offset, offset + text.length) === text

/** Dimensão válida (positiva e de tamanho razoável) ou null. */
const dim = (n: number): number | null => (Number.isFinite(n) && n > 0 && n <= 100_000 ? n : null)

export function sniffImage(head: Buffer): ImageInfo | null {
  // PNG: assinatura de 8 bytes + chunk IHDR
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    const ok = head.length >= 24 && ascii(head, 12, 'IHDR')
    return {
      contentType: 'image/png',
      width: ok ? dim(head.readUInt32BE(16)) : null,
      height: ok ? dim(head.readUInt32BE(20)) : null
    }
  }

  // GIF87a / GIF89a
  if (ascii(head, 0, 'GIF87a') || ascii(head, 0, 'GIF89a')) {
    const ok = head.length >= 10
    return { contentType: 'image/gif', width: ok ? dim(head.readUInt16LE(6)) : null, height: ok ? dim(head.readUInt16LE(8)) : null }
  }

  // WebP: RIFF....WEBP + chunk VP8 / VP8L / VP8X
  if (ascii(head, 0, 'RIFF') && ascii(head, 8, 'WEBP')) {
    const size = webpSize(head)
    return { contentType: 'image/webp', width: size?.[0] ?? null, height: size?.[1] ?? null }
  }

  // JPEG: FF D8 FF
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    const size = jpegSize(head)
    return { contentType: 'image/jpeg', width: size?.[0] ?? null, height: size?.[1] ?? null }
  }

  return null
}

function webpSize(buf: Buffer): [number | null, number | null] | null {
  if (buf.length < 30) return null
  if (ascii(buf, 12, 'VP8 ')) {
    return [dim(buf.readUInt16LE(26) & 0x3fff), dim(buf.readUInt16LE(28) & 0x3fff)]
  }
  if (ascii(buf, 12, 'VP8L')) {
    const b0 = buf[21]
    const b1 = buf[22]
    const b2 = buf[23]
    const b3 = buf[24]
    return [dim(1 + (((b1 & 0x3f) << 8) | b0)), dim(1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)))]
  }
  if (ascii(buf, 12, 'VP8X')) {
    return [dim(1 + buf.readUIntLE(24, 3)), dim(1 + buf.readUIntLE(27, 3))]
  }
  return null
}

// Marcadores SOF (início do quadro) que trazem altura e largura.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function jpegSize(buf: Buffer): [number | null, number | null] | null {
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marker = buf[i + 1]
    if (marker === 0xff) {
      i++ // bytes de preenchimento
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2 // marcadores sem tamanho
      continue
    }
    const length = buf.readUInt16BE(i + 2)
    if (SOF.has(marker)) return [dim(buf.readUInt16BE(i + 7)), dim(buf.readUInt16BE(i + 5))]
    if (length < 2) return null
    i += 2 + length
  }
  return null
}
