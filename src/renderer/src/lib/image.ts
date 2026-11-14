import { AVATAR_MAX_BYTES } from '@shared/types'

const SIZE = 256

/** Recorta a imagem no centro, reduz para 256×256 e devolve um data URL WebP. */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Não foi possível abrir essa imagem')
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bitmap.close()
  for (const quality of [0.85, 0.7, 0.5]) {
    const url = canvas.toDataURL('image/webp', quality)
    if (url.length * 0.75 < AVATAR_MAX_BYTES) return url
  }
  throw new Error('Imagem grande demais')
}

export function randomTag(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}
