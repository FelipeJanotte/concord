import { describe, expect, it } from 'vitest'
import { huntRefusal, isRegionUnlocked, REGIONS, unlockLevel, wildEncounter, wildLevelRange } from './regions'
import { itemCategory, itemDescription, itemLabel, itemPrice, MARKET, stoneId, stoneTypes } from './items'
import { POKEMON_TYPES } from './types'

const always = (value: number) => () => value

describe('regiões', () => {
  it('as 9 regiões cobrem a Pokédex sem buraco', () => {
    expect(REGIONS.map((r) => r.label)).toEqual(['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'])
    REGIONS.slice(1).forEach((r, i) => expect(r.first).toBe(REGIONS[i].last + 1))
    expect([REGIONS[0].first, REGIONS.at(-1)!.last]).toEqual([1, 1025])
  })

  it('cada região libera a cada 100 níveis de treinador', () => {
    expect(unlockLevel('kanto')).toBe(0)
    expect(unlockLevel('johto')).toBe(100)
    expect(unlockLevel('paldea')).toBe(800)
    expect(isRegionUnlocked('johto', 99)).toBe(false)
    expect(isRegionUnlocked('johto', 100)).toBe(true)
  })

  it('selvagem de 0,8× a 1,2× do nível do pokémon, +10% por região', () => {
    expect(wildLevelRange(50, 'kanto')).toEqual({ min: 40, max: 60 })
    expect(wildLevelRange(50, 'johto')).toEqual({ min: 44, max: 66 })
    expect(wildLevelRange(1, 'kanto')).toEqual({ min: 2, max: 2 })
  })

  it('caçando, todo encontro é o pokémon escolhido, no nível da faixa da região', () => {
    expect(wildEncounter('kanto', 50, always(0.999), 25)).toEqual({ id: 25, level: 60 })
    expect(wildEncounter('kanto', 50, always(0), 25)).toEqual({ id: 25, level: 40 })
  })

  it('caçar só a primeira forma, da região, e nunca lendário ou mítico', () => {
    const base = { base: true, legendary: false }
    expect(huntRefusal('kanto', 4, base)).toBeNull()
    expect(huntRefusal('kanto', 152, base)).toBe('Esse pokémon não é de Kanto')
    expect(huntRefusal('kanto', 5, { base: false, legendary: false })).toBe('Só a primeira forma do pokémon pode ser caçada')
    expect(huntRefusal('kanto', 150, { base: true, legendary: true })).toBe('Lendários e míticos não podem ser caçados')
  })

  it('só aparecem pokémon da região, no nível da faixa', () => {
    expect(wildEncounter('johto', 50, always(0))).toEqual({ id: 152, level: 44 })
    expect(wildEncounter('johto', 50, always(0.999))).toEqual({ id: 251, level: 66 })
  })
})

describe('itens', () => {
  it('market tem 4 pokébolas, poções e hold items', () => {
    expect(MARKET.ball.map(itemLabel)).toEqual(['Poké Ball', 'Great Ball', 'Ultra Ball', 'Beast Ball'])
    expect(MARKET.potion).toEqual(['potion', 'super-potion', 'hyper-potion', 'max-potion', 'revive', 'max-revive'])
    expect(['revive', 'max-revive'].map(itemCategory)).toEqual(['revive', 'revive'])
    expect(MARKET.hold.every((id) => itemCategory(id) === 'hold' && itemPrice(id)! > 0)).toBe(true)
  })

  it('bola mais forte custa mais', () => {
    expect(MARKET.ball.map(itemPrice)).toEqual([200, 600, 1200, 3000])
  })

  it('descrição: taxa de captura das bolas e efeito dos hold items', () => {
    expect(MARKET.ball.map(itemDescription)).toEqual(['Taxa de captura 1x', 'Taxa de captura 2x', 'Taxa de captura 5x', 'Taxa de captura 10x'])
    expect(itemDescription('leftovers')).toBe('Recupera 1/16 do HP no fim de cada turno')
    expect(['potion', 'super-potion', 'hyper-potion'].map(itemDescription)).toEqual(['Recupera 10% do HP', 'Recupera 30% do HP', 'Recupera 60% do HP'])
    expect(itemDescription('max-potion')).toBe('Recupera todo o HP')
    expect(itemDescription('revive')).toBe('Revive um pokémon desmaiado com 30% do HP')
    expect(itemDescription('max-revive')).toBe('Revive um pokémon desmaiado com todo o HP')
    expect(itemDescription(stoneId('fire'))).toBeNull()
  })

  it('cada um dos 18 tipos tem pedra e nenhuma é vendida no market', () => {
    expect(POKEMON_TYPES.every((t) => itemCategory(stoneId(t)) === 'stone' && itemPrice(stoneId(t)) === null)).toBe(true)
    expect(itemCategory('stone-banana')).toBeNull()
  })

  it('pedras têm nome próprio', () => {
    expect(itemLabel(stoneId('water'))).toBe("Pedra d'Água")
    expect(itemLabel(stoneId('bug'))).toBe('Pedra Casulo')
    expect(itemLabel(stoneId('normal'))).toBe('Pedra do Sol')
    expect(itemLabel(stoneId('dragon'))).toBe('Pedra Ancestral')
  })

  it('Fantasma e Sombrio usam a mesma Pedra das Trevas', () => {
    expect(stoneId('dark')).toBe(stoneId('ghost'))
    expect(itemLabel(stoneId('dark'))).toBe('Pedra das Trevas')
    expect(itemCategory('stone-dark')).toBeNull()
    expect(stoneTypes(stoneId('dark'))).toEqual(['Fantasma', 'Sombrio'])
    expect(stoneTypes(stoneId('fire'))).toEqual(['Fogo'])
  })
})
