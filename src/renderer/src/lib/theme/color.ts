/**
 * Cores para o motor de temas: misturar, média, luminância e contraste (fórmulas do WCAG 2.x).
 * Tudo em `#rrggbb` minúsculo; funções puras.
 */

type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/** `a` → `b` na proporção `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a.toLowerCase()
  if (t >= 1) return b.toLowerCase()
  const [x, y] = [hexToRgb(a), hexToRgb(b)]
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

/** Média das cores (o "tom" de um gradiente). */
export function average(colors: string[]): string {
  const sum = colors.map(hexToRgb).reduce<Rgb>((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0])
  return rgbToHex([sum[0] / colors.length, sum[1] / colors.length, sum[2] / colors.length])
}

/** Luminância relativa (WCAG). */
export function luminance(hex: string): number {
  const lin = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Razão de contraste entre duas cores (1 a 21). */
export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** AA para texto normal. */
export const AA = 4.5

/**
 * A cor `fg` ajustada (indo em direção a `toward`, ex.: branco no tema escuro) até ter pelo menos
 * `min` de contraste com **todas** as cores de `backgrounds`. Já atende: devolve igual.
 */
export function ensureContrast(fg: string, backgrounds: string[], toward: string, min = AA): string {
  const ok = (c: string): boolean => backgrounds.every((bg) => contrast(c, bg) >= min)
  if (ok(fg)) return fg.toLowerCase()
  for (let t = 0.05; t < 1; t += 0.05) {
    const candidate = mix(fg, toward, t)
    if (ok(candidate)) return candidate
  }
  return toward.toLowerCase()
}

/** Branco ou preto: o que contrasta mais com `bg` (texto sobre a cor de destaque). */
export function readableOn(bg: string): '#ffffff' | '#000000' {
  return contrast('#ffffff', bg) >= contrast('#000000', bg) ? '#ffffff' : '#000000'
}
