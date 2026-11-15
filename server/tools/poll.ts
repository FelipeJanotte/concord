/** Enquete (v4): validação e o estado inicial (sem votos). Função pura. */
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX, type PollResult } from '../../src/shared/types'

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

export function validatePoll(raw: unknown): { question: string; options: string[]; multiple: boolean } | string {
  const req = raw as { question?: unknown; options?: unknown; multiple?: unknown } | null
  const question = clean(req?.question)
  if (!question || question.length > POLL_QUESTION_MAX) return `A pergunta precisa ter de 1 a ${POLL_QUESTION_MAX} caracteres`
  if (!req || !Array.isArray(req.options)) return 'Lista de opções inválida'
  const options: string[] = []
  const seen = new Set<string>()
  for (const o of req.options as unknown[]) {
    const text = clean(o)
    if (!text) continue // campo de opção vazio: só ignora
    if (text.length > POLL_OPTION_MAX) return `Cada opção pode ter no máximo ${POLL_OPTION_MAX} caracteres`
    const key = text.toLocaleLowerCase('pt-BR')
    if (seen.has(key)) return `Opção repetida: ${text}`
    seen.add(key)
    options.push(text)
  }
  if (options.length < POLL_MIN_OPTIONS) return `Coloque pelo menos ${POLL_MIN_OPTIONS} opções`
  if (options.length > POLL_MAX_OPTIONS) return `No máximo ${POLL_MAX_OPTIONS} opções`
  return { question, options, multiple: req.multiple === true }
}

export function newPoll(input: { question: string; options: string[]; multiple: boolean }): PollResult {
  return { ...input, counts: input.options.map(() => 0), voters: 0, closed: false }
}

/** Confere a escolha de um voto: índices inteiros e válidos, sem repetir; voto único = no máximo 1. */
export function validateChoices(poll: PollResult, raw: unknown): number[] | string {
  if (!Array.isArray(raw)) return 'Voto inválido'
  const choices = raw as unknown[]
  if (!choices.every((c) => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < poll.options.length)) return 'Opção inválida'
  if (new Set(choices).size !== choices.length) return 'Opção repetida'
  if (!poll.multiple && choices.length > 1) return 'Esta enquete aceita só uma opção'
  return [...(choices as number[])].sort((a, b) => a - b)
}
