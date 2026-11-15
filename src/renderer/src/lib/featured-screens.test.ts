import { describe, expect, it } from 'vitest'
import { featuredScreens, moveScreen, toggleFeatured } from './featured-screens'

describe('featuredScreens', () => {
  it('sem telas ou na grade: nenhuma', () => {
    expect(featuredScreens([], 'eu', [], false)).toEqual([])
    expect(featuredScreens(['ana'], 'eu', ['ana'], true)).toEqual([])
  })

  it('sem escolha: a primeira de outra pessoa; a própria só se for a única', () => {
    expect(featuredScreens(['eu', 'ana', 'bia'], 'eu', [], false)).toEqual(['ana'])
    expect(featuredScreens(['eu'], 'eu', [], false)).toEqual(['eu'])
  })

  it('as escolhidas ainda ao vivo, na ordem escolhida', () => {
    expect(featuredScreens(['eu', 'ana', 'bia'], 'eu', ['bia', 'eu'], false)).toEqual(['bia', 'eu'])
    expect(featuredScreens(['eu', 'ana'], 'eu', ['bia', 'eu'], false)).toEqual(['eu'])
  })

  it('todas as escolhidas acabaram: volta ao automático', () => {
    expect(featuredScreens(['eu', 'ana'], 'eu', ['bia'], false)).toEqual(['ana'])
  })
})

describe('toggleFeatured', () => {
  it('põe no fim ou tira do destaque', () => {
    expect(toggleFeatured(['ana'], 'bia')).toEqual(['ana', 'bia'])
    expect(toggleFeatured(['ana', 'bia'], 'ana')).toEqual(['bia'])
  })

  it('a última não sai do destaque', () => {
    expect(toggleFeatured(['ana'], 'ana')).toEqual(['ana'])
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
