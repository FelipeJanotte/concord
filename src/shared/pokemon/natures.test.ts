import { describe, expect, it } from 'vitest'
import { createMon, damage, withDefaults, newGame, type Mon, type Species } from './game'
import { NATURES, natureFactor, randomNature } from './natures'

const species: Species = {
  id: 1,
  name: 'x',
  types: ['normal'],
  sprite: '',
  backSprite: '',
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [{ name: 'tackle', power: 40, type: 'normal', level: 1, category: 'physical' }],
  evolution: null
}

describe('naturezas', () => {
  it('são as 25 da PokeAPI, com 5 neutras', () => {
    expect(Object.keys(NATURES)).toHaveLength(25)
    expect(Object.values(NATURES).filter((n) => !n.up)).toHaveLength(5)
    expect(NATURES.adamant).toEqual({ up: 'attack', down: 'spAttack' })
    expect(NATURES.timid).toEqual({ up: 'speed', down: 'attack' })
  })

  it('+10% no atributo que sobe e −10% no que desce', () => {
    expect(natureFactor('adamant', 'attack')).toBe(1.1)
    expect(natureFactor('adamant', 'spAttack')).toBe(0.9)
    expect(natureFactor('adamant', 'speed')).toBe(1)
    expect(natureFactor('hardy', 'attack')).toBe(1)
  })

  it('é sorteada entre as 25', () => {
    expect(randomNature(() => 0)).toBe('hardy')
    expect(randomNature(() => 0.999)).toBe('quirky')
  })

  it('vale na batalha: Adamant bate mais forte com golpe físico', () => {
    const defender = createMon(species, 30, 'd')
    const adamant = createMon(species, 30, 'a', 'adamant')
    const modest = createMon(species, 30, 'm', 'modest')
    expect(adamant.nature).toBe('adamant')
    expect(damage(adamant, defender, species.moves[0], 1)).toBeGreaterThan(damage(modest, defender, species.moves[0], 1))
  })

  it('save antigo sem natureza fica Hardy (neutra)', () => {
    const old = { ...createMon(species, 5, 'o'), nature: undefined } as unknown as Mon
    expect(withDefaults({ ...newGame(old, 'male-1') }).team[0].nature).toBe('hardy')
  })
})
