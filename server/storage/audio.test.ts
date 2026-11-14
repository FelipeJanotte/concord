import { describe, expect, it } from 'vitest'
import { wav } from '../tests/audio-fixtures'
import { audioDurationMs, sniffAudio } from './audio'

describe('sniffAudio', () => {
  it.each([
    ['WAV', wav(0.1), 'audio/wav'],
    ['OGG', Buffer.from('OggS\0\x02rest', 'latin1'), 'audio/ogg'],
    ['WebM', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]), 'audio/webm'],
    ['MP3 com ID3', Buffer.from('ID3\x04\0\0', 'latin1'), 'audio/mpeg'],
    ['MP3 sem tag (quadro MPEG)', Buffer.from([0xff, 0xfb, 0x90, 0x00]), 'audio/mpeg']
  ] as const)('reconhece %s pelos bytes', (_label, data, type) => {
    expect(sniffAudio(data)).toBe(type)
  })

  it.each([
    ['texto', Buffer.from('não sou áudio')],
    ['PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ['RIFF que não é WAVE (WebP)', Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')],
    ['0xFF sem sincronia válida', Buffer.from([0xff, 0xe0, 0x00])],
    ['vazio', Buffer.alloc(0)]
  ])('não aceita %s', (_label, data) => {
    expect(sniffAudio(data)).toBeNull()
  })
})

describe('audioDurationMs', () => {
  it('lê a duração de um WAV', async () => {
    expect(await audioDurationMs(wav(4), 'audio/wav')).toBe(4000)
    expect(await audioDurationMs(wav(0.25), 'audio/wav')).toBe(250)
  })

  it('arquivo corrompido ou sem duração dá null (nunca lança)', async () => {
    expect(await audioDurationMs(Buffer.from('OggS lixo', 'latin1'), 'audio/ogg')).toBeNull()
    expect(await audioDurationMs(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'audio/webm')).toBeNull()
    expect(await audioDurationMs(wav(0), 'audio/wav')).toBeNull()
  })
})
