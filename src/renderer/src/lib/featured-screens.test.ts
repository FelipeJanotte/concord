import { describe, expect, it } from 'vitest'
import type { VoiceState } from '@shared/types'
import { featuredScreens, moveScreen, screenViewers, toggleFeatured, watchedScreens } from './featured-screens'

describe('featuredScreens', () => {
  it('sem escolha: nenhuma, nem a própria (assistir é opcional)', () => {
    expect(featuredScreens([], [])).toEqual([])
    expect(featuredScreens(['eu', 'ana', 'bia'], [])).toEqual([])
    expect(featuredScreens(['eu'], [])).toEqual([])
  })

  it('as escolhidas ainda ao vivo, na ordem escolhida', () => {
    expect(featuredScreens(['eu', 'ana', 'bia'], ['bia', 'eu'])).toEqual(['bia', 'eu'])
    expect(featuredScreens(['eu', 'ana'], ['bia', 'eu'])).toEqual(['eu'])
  })

  it('todas as escolhidas acabaram: nenhuma', () => {
    expect(featuredScreens(['eu', 'ana'], ['bia'])).toEqual([])
  })
})

describe('watchedScreens', () => {
  it('as telas em destaque menos a própria prévia', () => {
    expect(watchedScreens(['ana', 'eu', 'bia'], 'eu')).toEqual(['ana', 'bia'])
    expect(watchedScreens(['eu'], 'eu')).toEqual([])
    expect(watchedScreens(['ana'], undefined)).toEqual(['ana'])
  })
})

describe('toggleFeatured', () => {
  it('põe no fim ou tira do destaque', () => {
    expect(toggleFeatured(['ana'], 'bia')).toEqual(['ana', 'bia'])
    expect(toggleFeatured(['ana', 'bia'], 'ana')).toEqual(['bia'])
  })

  it('a última também sai do destaque (parar de assistir)', () => {
    expect(toggleFeatured(['ana'], 'ana')).toEqual([])
  })
})

describe('moveScreen', () => {
  it('leva a tela arrastada para o lugar da tela de destino', () => {
    expect(moveScreen(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
    expect(moveScreen(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(moveScreen(['a', 'b', 'c'], 'b', 'c')).toEqual(['a', 'c', 'b'])
  })

  it('sobre ela mesma ou com id desconhecido: não muda', () => {
    expect(moveScreen(['a', 'b'], 'a', 'a')).toEqual(['a', 'b'])
    expect(moveScreen(['a', 'b'], 'x', 'a')).toEqual(['a', 'b'])
    expect(moveScreen(['a', 'b'], 'a', 'x')).toEqual(['a', 'b'])
  })
})

describe('screenViewers', () => {
  const state = (userId: string, watching?: string[]): VoiceState => ({ userId, channelId: 'sala', muted: false, deafened: false, sharing: false, watching })

  it('quem está assistindo a tela, na ordem da sala', () => {
    const voice = [state('eu'), state('ana', ['eu']), state('bia', ['ana', 'eu']), state('cid', ['ana'])]
    expect(screenViewers(voice, 'eu')).toEqual(['ana', 'bia'])
    expect(screenViewers(voice, 'ana')).toEqual(['bia', 'cid'])
    expect(screenViewers(voice, 'cid')).toEqual([])
  })
})
