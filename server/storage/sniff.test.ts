import { describe, expect, it } from 'vitest'
import { sniffImage } from './sniff'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'latin1')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

function gif(width: number, height: number): Buffer {
  const b = Buffer.alloc(16)
  b.write('GIF89a', 0, 'latin1')
  b.writeUInt16LE(width, 6)
  b.writeUInt16LE(height, 8)
  return b
}

function webp(chunk: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number): Buffer {
  const b = Buffer.alloc(40)
  b.write('RIFF', 0, 'latin1')
  b.writeUInt32LE(32, 4)
  b.write('WEBP', 8, 'latin1')
  b.write(chunk, 12, 'latin1')
  if (chunk === 'VP8 ') {
    Buffer.from([0x9d, 0x01, 0x2a]).copy(b, 23)
    b.writeUInt16LE(width, 26)
    b.writeUInt16LE(height, 28)
  } else if (chunk === 'VP8L') {
    b[20] = 0x2f
    b.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 21)
  } else {
    b.writeUIntLE(width - 1, 24, 3)
    b.writeUIntLE(height - 1, 27, 3)
  }
  return b
}

function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(9)])
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03])
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, Buffer.from([0xff, 0xff]), sof, Buffer.alloc(16)])
}

describe('sniffImage', () => {
  it('reconhece PNG real e lê as dimensões', () => {
    expect(sniffImage(PNG_1PX)).toEqual({ contentType: 'image/png', width: 1, height: 1 })
    expect(sniffImage(png(640, 480))).toEqual({ contentType: 'image/png', width: 640, height: 480 })
  })

  it('reconhece GIF', () => {
    expect(sniffImage(gif(320, 200))).toEqual({ contentType: 'image/gif', width: 320, height: 200 })
  })

  it.each(['VP8 ', 'VP8L', 'VP8X'] as const)('reconhece WebP (%s)', (chunk) => {
    expect(sniffImage(webp(chunk, 1024, 768))).toEqual({ contentType: 'image/webp', width: 1024, height: 768 })
  })

  it('reconhece JPEG pulando os segmentos antes do SOF', () => {
    expect(sniffImage(jpeg(1920, 1080))).toEqual({ contentType: 'image/jpeg', width: 1920, height: 1080 })
  })

  it('JPEG cortado antes do SOF continua JPEG, sem dimensões', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toEqual({
      contentType: 'image/jpeg',
      width: null,
      height: null
    })
  })

  it('cabeçalho PNG truncado: tipo certo, dimensões desconhecidas', () => {
    expect(sniffImage(png(10, 10).subarray(0, 12))).toEqual({ contentType: 'image/png', width: null, height: null })
  })

  it('dimensões absurdas viram null', () => {
    expect(sniffImage(png(0, 5_000_000))).toEqual({ contentType: 'image/png', width: null, height: null })
  })

  it.each([
    ['HTML', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['PDF', Buffer.from('%PDF-1.7\n')],
    ['vazio', Buffer.alloc(0)],
    ['texto que começa com GIF', Buffer.from('GIF não é imagem')]
  ])('não trata %s como imagem', (_label, data) => {
    expect(sniffImage(data)).toBeNull()
  })
})
