import { describe, expect, it } from 'vitest'
import { createMon, damage, statTotal, type Species } from './game'
import { effectiveness, POKEMON_TYPES } from './types'

describe('tabela de tipos', () => {
  it('tem os 18 tipos', () => {
    expect(POKEMON_TYPES).toHaveLength(18)
  })

  it('multiplica pelo tipo de cada defensor', () => {
    expect(effectiveness('water', ['fire'])).toBe(2)
    expect(effectiveness('water', ['fire', 'rock'])).toBe(4)
    expect(effectiveness('fire', ['water'])).toBe(0.5)
    expect(effectiveness('fire', ['water', 'rock'])).toBe(0.25)
    expect(effectiveness('normal', ['ghost'])).toBe(0)
    expect(effectiveness('electric', ['water', 'ground'])).toBe(0)
    expect(effectiveness('grass', ['normal'])).toBe(1)
  })

  it('cada imunidade conhecida dá 0', () => {
    expect(effectiveness('ground', ['flying'])).toBe(0)
    expect(effectiveness('psychic', ['dark'])).toBe(0)
    expect(effectiveness('dragon', ['fairy'])).toBe(0)
    expect(effectiveness('poison', ['steel'])).toBe(0)
    expect(effectiveness('fighting', ['ghost'])).toBe(0)
    expect(effectiveness('ghost', ['normal'])).toBe(0)
  })
})

const species = (types: string[], stats: Partial<Species['stats']> = {}): Species => ({
  id: 1,
  name: 'x',
  types,
  sprite: '',
  backSprite: '',
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50, ...stats },
  moves: [],
  evolution: null
})

describe('dano com tipo e categoria', () => {
  const attacker = createMon(species(['normal']), 20, 'a')
  const water = { name: 'water-gun', power: 40, type: 'water', level: 1, category: 'special' as const }

  it('2x contra fogo, 0,5x contra planta e 0 contra imune', () => {
    const neutral = damage(attacker, createMon(species(['normal']), 20, 'n'), water, 1)
    expect(damage(attacker, createMon(species(['fire']), 20, 'f'), water, 1)).toBeGreaterThanOrEqual(neutral * 2 - 1)
    expect(damage(attacker, createMon(species(['grass']), 20, 'g'), water, 1)).toBeLessThanOrEqual(Math.ceil(neutral / 2))
    expect(damage(attacker, createMon(species(['ghost']), 20, 'g'), { ...water, type: 'normal' }, 1)).toBe(0)
  })

  it('dois tipos multiplicam: 4x contra fogo/pedra e 0,25x contra planta/dragão', () => {
    const neutral = damage(attacker, createMon(species(['normal']), 20, 'n'), water, 1)
    const quadruple = damage(attacker, createMon(species(['fire', 'rock']), 20, 'fr'), water, 1)
    const quarter = damage(attacker, createMon(species(['grass', 'dragon']), 20, 'gd'), water, 1)
    expect(quadruple).toBeGreaterThanOrEqual(neutral * 4 - 3)
    expect(quadruple).toBeGreaterThan(damage(attacker, createMon(species(['fire']), 20, 'f'), water, 1))
    expect(quarter).toBeLessThanOrEqual(Math.ceil(neutral / 4))
    expect(quarter).toBeLessThan(damage(attacker, createMon(species(['grass']), 20, 'g'), water, 1))
  })

  it('golpe especial usa ataque especial contra defesa especial; físico usa ataque e defesa', () => {
    const special = createMon(species(['normal'], { attack: 10, spAttack: 200 }), 20, 's')
    const defender = createMon(species(['normal']), 20, 'd')
    const physical = { ...water, type: 'normal', category: 'physical' as const }
    expect(damage(special, defender, { ...physical, category: 'special' }, 1)).toBeGreaterThan(damage(special, defender, physical, 1))
    const wall = createMon(species(['normal'], { defense: 200, spDefense: 10 }), 20, 'w')
    expect(damage(attacker, wall, { ...physical, category: 'special' }, 1)).toBeGreaterThan(damage(attacker, wall, physical, 1))
  })

  it('total dos atributos é a soma dos 6', () => {
    expect(statTotal({ hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 })).toBe(318)
  })
})
