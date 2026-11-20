import type { CustomStatus } from './types/account'

export const BIO_MAX = 190
export const BIO_LINE_BREAKS_MAX = 5
export const CUSTOM_STATUS_TEXT_MAX = 60
export const CUSTOM_STATUS_DURATION_MAX_MS = 24 * 60 * 60 * 1000

export type CustomStatusDuration = '30m' | '1h' | '4h' | 'today' | 'never'

type Parsed<T> = ({ ok: true } & T) | { ok: false; error: string }

const SINGLE_EMOJI = new RegExp('^\\p{RGI_Emoji}$', 'v')

export function isSingleEmoji(value: string): boolean {
  return SINGLE_EMOJI.test(value)
}

export function parseBio(raw: unknown): Parsed<{ bio: string }> {
  if (typeof raw !== 'string') return { ok: false, error: 'Bio inválida' }
  const bio = raw.replace(/\r\n?/g, '\n').trim()
  if (bio.length > BIO_MAX) return { ok: false, error: `A bio pode ter até ${BIO_MAX} caracteres` }
  if (bio.split('\n').length - 1 > BIO_LINE_BREAKS_MAX) {
    return { ok: false, error: `A bio pode ter até ${BIO_LINE_BREAKS_MAX} quebras de linha` }
  }
  return { ok: true, bio }
}

function parseExpiry(raw: unknown, now: number): Parsed<{ expiresAt: string | null }> {
  if (raw === undefined || raw === null) return { ok: true, expiresAt: null }
  const at = typeof raw === 'string' ? Date.parse(raw) : NaN
  if (!(at > now && at <= now + CUSTOM_STATUS_DURATION_MAX_MS)) return { ok: false, error: 'Validade inválida' }
  return { ok: true, expiresAt: new Date(at).toISOString() }
}

export function parseCustomStatus(raw: unknown, now: number): Parsed<{ status: CustomStatus | null }> {
  if (raw === null) return { ok: true, status: null }
  if (typeof raw !== 'object') return { ok: false, error: 'Status inválido' }
  const { emoji: rawEmoji, text: rawText, expiresAt: rawExpiry } = raw as Record<string, unknown>
  if (rawEmoji !== undefined && typeof rawEmoji !== 'string') return { ok: false, error: 'Emoji inválido' }
  if (rawText !== undefined && typeof rawText !== 'string') return { ok: false, error: 'Status inválido' }
  const emoji = rawEmoji?.trim() ?? ''
  const text = rawText?.trim().replace(/\s+/g, ' ') ?? ''
  if (!emoji && !text) return { ok: false, error: 'Escolha um emoji ou escreva um status' }
  if (emoji && !isSingleEmoji(emoji)) return { ok: false, error: 'Emoji inválido' }
  if (text.length > CUSTOM_STATUS_TEXT_MAX) return { ok: false, error: `O status pode ter até ${CUSTOM_STATUS_TEXT_MAX} caracteres` }
  const expiry = parseExpiry(rawExpiry, now)
  if (!expiry.ok) return expiry
  return { ok: true, status: { ...(emoji ? { emoji } : {}), ...(text ? { text } : {}), expiresAt: expiry.expiresAt } }
}

export function activeCustomStatus(status: CustomStatus | null | undefined, now: number): CustomStatus | null {
  if (!status) return null
  return status.expiresAt && Date.parse(status.expiresAt) <= now ? null : status
}

const MINUTE = 60_000
const DURATION_MS: Record<Exclude<CustomStatusDuration, 'today' | 'never'>, number> = {
  '30m': 30 * MINUTE,
  '1h': 60 * MINUTE,
  '4h': 4 * 60 * MINUTE
}

export function customStatusExpiry(duration: CustomStatusDuration, now: Date): string | null {
  if (duration === 'never') return null
  if (duration === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  return new Date(now.getTime() + DURATION_MS[duration]).toISOString()
}
