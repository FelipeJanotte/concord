/**
 * "Surpreenda-me" (Aparência): sorteia um tema bonito e válido. A graça vem de cores que combinam: um
 * matiz principal e um esquema (análogo, complementar ou tríade) para o gradiente, cores de fundo com
 * saturação e luz certas para a base (escuras no escuro, claras no claro) e o destaque vivo do mesmo
 * matiz. O contraste do texto já é garantido pelo `deriveTokens`. O vidro (`translucent`) não é sorteado:
 * fica como estava.
 */
import { validateTheme, type ThemeConfig } from '@shared/types'
import { rgbToHex } from './color'
import { sameTheme } from './editor'

type Random = () => number

/** HSL (h 0–360, s e l 0–1) → `#rrggbb`. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255])
}

const between = (random: Random, min: number, max: number): number => min + random() * (max - min)
const pick = <T>(random: Random, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))]

/** Deslocamentos de matiz de cada esquema (o primeiro é o matiz principal). */
const SCHEMES = [
  [0, 30, 60], // análogo
  [0, 25, 180], // complementar
  [0, 120, 240], // tríade
  [0, -35, 35] // análogo para os dois lados
] as const

/** Um tema sorteado (sempre válido). `keep` = tema atual: mantém o vidro e nunca devolve igual a ele. */
export function surpriseTheme(random: Random = Math.random, keep?: ThemeConfig): ThemeConfig {
  for (;;) {
    const dark = random() < 0.75
    const hue = between(random, 0, 360)
    const scheme = pick(random, SCHEMES)
    const count = random() < 0.5 ? 2 : 3
    const stops = scheme
      .slice(0, count)
      .map((shift) => (dark ? hslToHex(hue + shift, between(random, 0.35, 0.7), between(random, 0.12, 0.28)) : hslToHex(hue + shift, between(random, 0.45, 0.85), between(random, 0.85, 0.93))))
    const accent = dark ? hslToHex(hue, between(random, 0.65, 0.95), between(random, 0.6, 0.7)) : hslToHex(hue, between(random, 0.6, 0.9), between(random, 0.38, 0.48))
    const theme = validateTheme({
      base: dark ? 'escuro' : 'claro',
      accent,
      background: { stops, angle: Math.round(between(random, 0, 24)) * 15 },
      intensity: Math.round(between(random, 45, 85)),
      ...(keep?.translucent ? { translucent: true } : {})
    })
    if (theme && !(keep && sameTheme(theme, keep))) return theme
  }
}
