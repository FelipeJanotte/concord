// Regra do emoji dos efeitos sonoros (a mesma no servidor e na tela da B17).
import { describe, expect, it } from 'vitest'
import { cleanSoundEmoji, SOUND_EMOJI_MAX } from './sounds'

describe('cleanSoundEmoji', () => {
  it('vazio, só espaços ou só controle = sem emoji', () => {
    expect(cleanSoundEmoji('')).toBeNull()
    expect(cleanSoundEmoji('   ')).toBeNull()
    expect(cleanSoundEmoji('\u0000\u001f')).toBeNull()
  })

  it('emojis compostos que são um símbolo só na tela passam (conta code points, como o banco)', () => {
    for (const e of ['📯', '👍🏽', '🇧🇷', '❤️', '👨‍👩‍👧‍👦', '🏳️‍🌈', '😂😂']) expect(cleanSoundEmoji(e)).toBe(e)
    expect('👨‍👩‍👧‍👦'.length).toBeGreaterThan(SOUND_EMOJI_MAX) // em UTF-16 passaria do limite
  })

  it('poucos caracteres passam; mais de 8 code points não', () => {
    expect(cleanSoundEmoji('  LOL ')).toBe('LOL')
    expect(cleanSoundEmoji('a'.repeat(SOUND_EMOJI_MAX))).toBe('a'.repeat(SOUND_EMOJI_MAX))
    expect(cleanSoundEmoji('a'.repeat(SOUND_EMOJI_MAX + 1))).toBeUndefined()
    expect(cleanSoundEmoji('👨‍👩‍👧‍👦👨‍👩‍👧‍👦')).toBeUndefined()
  })

  it('tira caracteres de controle do meio', () => {
    expect(cleanSoundEmoji('😀\u0007')).toBe('😀')
  })
})
