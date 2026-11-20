import { describe, expect, it } from 'vitest'
import { activeCustomStatus, customStatusExpiry, isSingleEmoji, parseBio, parseCustomStatus } from './profile'

const NOW = Date.parse('2026-11-19T15:00:00.000Z')
const inMinutes = (m: number): string => new Date(NOW + m * 60_000).toISOString()

describe('parseBio', () => {
  it('aceita texto com formatação e tira espaços das pontas', () => {
    expect(parseBio('  **oi**, sou eu  ')).toEqual({ ok: true, bio: '**oi**, sou eu' })
  })

  it('aceita vazio (apagar a bio)', () => {
    expect(parseBio('   ')).toEqual({ ok: true, bio: '' })
  })

  it('troca \\r\\n por \\n e aceita até 5 quebras de linha', () => {
    expect(parseBio('a\r\nb\nc\nd\ne\nf')).toEqual({ ok: true, bio: 'a\nb\nc\nd\ne\nf' })
    expect(parseBio('a\nb\nc\nd\ne\nf\ng')).toEqual({ ok: false, error: 'A bio pode ter até 5 quebras de linha' })
  })

  it('recusa mais de 190 caracteres', () => {
    expect(parseBio('x'.repeat(190))).toEqual({ ok: true, bio: 'x'.repeat(190) })
    expect(parseBio('x'.repeat(191))).toEqual({ ok: false, error: 'A bio pode ter até 190 caracteres' })
  })

  it('recusa o que não é texto', () => {
    expect(parseBio(42)).toEqual({ ok: false, error: 'Bio inválida' })
  })
})

describe('isSingleEmoji', () => {
  it.each(['😂', '❤️', '✌️', '👍🏽', '🏳️‍🌈', '⭐'])('aceita %s', (emoji) => {
    expect(isSingleEmoji(emoji)).toBe(true)
  })

  it.each(['', 'a', '😂😂', ':)', '1', '😂 '])('recusa %o', (value) => {
    expect(isSingleEmoji(value)).toBe(false)
  })
})

describe('parseCustomStatus', () => {
  it('null limpa o status', () => {
    expect(parseCustomStatus(null, NOW)).toEqual({ ok: true, status: null })
  })

  it('aceita emoji e texto, sem validade', () => {
    expect(parseCustomStatus({ emoji: '🎮', text: '  jogando   agora ' }, NOW)).toEqual({
      ok: true,
      status: { emoji: '🎮', text: 'jogando agora', expiresAt: null }
    })
  })

  it('aceita só o emoji ou só o texto', () => {
    expect(parseCustomStatus({ emoji: '☕' }, NOW)).toEqual({ ok: true, status: { emoji: '☕', expiresAt: null } })
    expect(parseCustomStatus({ text: 'almoçando', emoji: '' }, NOW)).toEqual({ ok: true, status: { text: 'almoçando', expiresAt: null } })
  })

  it('guarda a validade como instante ISO', () => {
    const at = new Date(NOW + 30 * 60_000)
    expect(parseCustomStatus({ text: 'já volto', expiresAt: at.toISOString() }, NOW)).toEqual({
      ok: true,
      status: { text: 'já volto', expiresAt: at.toISOString() }
    })
  })

  it.each([
    [{}, 'Escolha um emoji ou escreva um status'],
    [{ text: '   ', emoji: '' }, 'Escolha um emoji ou escreva um status'],
    [{ text: 'x'.repeat(61) }, 'O status pode ter até 60 caracteres'],
    [{ emoji: 'oi' }, 'Emoji inválido'],
    [{ emoji: '😂😂' }, 'Emoji inválido'],
    [{ emoji: 7 }, 'Emoji inválido'],
    [{ text: 7 }, 'Status inválido'],
    [{ text: 'a', expiresAt: 'amanhã' }, 'Validade inválida'],
    [{ text: 'a', expiresAt: inMinutes(-1) }, 'Validade inválida'],
    [{ text: 'a', expiresAt: inMinutes(24 * 60 + 1) }, 'Validade inválida'],
    ['texto', 'Status inválido']
  ])('recusa %o', (raw, error) => {
    expect(parseCustomStatus(raw, NOW)).toEqual({ ok: false, error })
  })

  it('aceita texto de 60 caracteres sem quebra de linha', () => {
    expect(parseCustomStatus({ text: `${'x'.repeat(30)}\n${'y'.repeat(29)}` }, NOW)).toEqual({
      ok: true,
      status: { text: `${'x'.repeat(30)} ${'y'.repeat(29)}`, expiresAt: null }
    })
  })
})

describe('activeCustomStatus', () => {
  it('sem status, nada', () => {
    expect(activeCustomStatus(null, NOW)).toBeNull()
    expect(activeCustomStatus(undefined, NOW)).toBeNull()
  })

  it('sem validade vale sempre', () => {
    expect(activeCustomStatus({ text: 'oi', expiresAt: null }, NOW)).toEqual({ text: 'oi', expiresAt: null })
    expect(activeCustomStatus({ text: 'oi' }, NOW)).toEqual({ text: 'oi' })
  })

  it('vale até a validade e some quando passa', () => {
    const status = { emoji: '🎮', expiresAt: inMinutes(10) }
    expect(activeCustomStatus(status, NOW)).toBe(status)
    expect(activeCustomStatus(status, NOW + 10 * 60_000)).toBeNull()
  })
})

describe('customStatusExpiry', () => {
  const now = new Date(2026, 10, 19, 15, 20)

  it('30 min, 1 h e 4 h a partir de agora', () => {
    expect(customStatusExpiry('30m', now)).toBe(new Date(now.getTime() + 30 * 60_000).toISOString())
    expect(customStatusExpiry('1h', now)).toBe(new Date(now.getTime() + 60 * 60_000).toISOString())
    expect(customStatusExpiry('4h', now)).toBe(new Date(now.getTime() + 4 * 60 * 60_000).toISOString())
  })

  it('hoje: fim do dia local', () => {
    expect(customStatusExpiry('today', now)).toBe(new Date(2026, 10, 20, 0, 0).toISOString())
  })

  it('nunca: sem validade', () => {
    expect(customStatusExpiry('never', now)).toBeNull()
  })
})
