/**
 * Dado, moeda e sortear 1 nome (v4): validação e sorteio, funções puras. O acaso vem de `rand(max)`
 * (inteiro em [0, max)); o servidor passa `crypto.randomInt`, os testes um gerador previsível.
 */
import {
  COIN_MAX_COUNT,
  DICE_MAX_COUNT,
  DICE_MAX_SIDES,
  DICE_MIN_SIDES,
  PICK_MAX_OPTIONS,
  PICK_MIN_OPTIONS,
  PICK_OPTION_MAX,
  type CoinResult,
  type DiceResult,
  type PickResult
} from '../../src/shared/types'
import type { Rand } from './teams'

const isIntIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

// ---------- Dado ----------

export function validateDice(raw: unknown): { sides: number; count: number } | string {
  const req = raw as { sides?: unknown; count?: unknown } | null
  if (!isIntIn(req?.sides, DICE_MIN_SIDES, DICE_MAX_SIDES)) return `O dado precisa ter de ${DICE_MIN_SIDES} a ${DICE_MAX_SIDES} lados`
  if (!isIntIn(req?.count, 1, DICE_MAX_COUNT)) return `Role de 1 a ${DICE_MAX_COUNT} dados`
  return { sides: req.sides, count: req.count }
}

export function rollDice({ sides, count }: { sides: number; count: number }, rand: Rand): DiceResult {
  const rolls = Array.from({ length: count }, () => rand(sides) + 1)
  return { sides, rolls, total: rolls.reduce((a, b) => a + b, 0) }
}

// ---------- Moeda ----------

export function validateCoin(raw: unknown): { count: number } | string {
  const req = raw as { count?: unknown } | null
  if (!isIntIn(req?.count, 1, COIN_MAX_COUNT)) return `Jogue de 1 a ${COIN_MAX_COUNT} moedas`
  return { count: req.count }
}

export function flipCoins({ count }: { count: number }, rand: Rand): CoinResult {
  return { flips: Array.from({ length: count }, () => (rand(2) === 0 ? 'cara' : 'coroa')) }
}

// ---------- Sortear 1 ----------

export function validatePick(raw: unknown): { options: string[] } | string {
  const req = raw as { options?: unknown } | null
  if (!req || !Array.isArray(req.options)) return 'Lista de opções inválida'
  const options: string[] = []
  const seen = new Set<string>()
  for (const o of req.options as unknown[]) {
    const text = typeof o === 'string' ? o.replace(/\s+/g, ' ').trim() : ''
    if (!text) continue // linha vazia no campo de texto: só ignora
    if (text.length > PICK_OPTION_MAX) return `Cada opção pode ter no máximo ${PICK_OPTION_MAX} caracteres`
    const key = text.toLocaleLowerCase('pt-BR')
    if (seen.has(key)) return `Opção repetida: ${text}`
    seen.add(key)
    options.push(text)
  }
  if (options.length < PICK_MIN_OPTIONS) return `Coloque pelo menos ${PICK_MIN_OPTIONS} opções`
  if (options.length > PICK_MAX_OPTIONS) return `No máximo ${PICK_MAX_OPTIONS} opções`
  return { options }
}

export function pickOne({ options }: { options: string[] }, rand: Rand): PickResult {
  return { options, picked: options[rand(options.length)] }
}
