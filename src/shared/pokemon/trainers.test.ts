import { describe, expect, it } from 'vitest'
import { createMon, newGame, withDefaults, type GameState, type Species } from './game'
import { DEFAULT_LOOK, isTrainerLook, TRAINER_LOOKS } from './trainers'

const species: Species = {
  id: 4,
  name: 'charmander',
  types: ['fire'],
  sprite: '',
  backSprite: '',
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [{ name: 'ember', power: 40, type: 'fire', level: 1, category: 'physical' }],
  evolution: null
}

describe('treinadores', () => {
  it('cada visual tem id único e gênero', () => {
    expect(new Set(TRAINER_LOOKS.map((l) => l.id)).size).toBe(TRAINER_LOOKS.length)
    expect(TRAINER_LOOKS.every((l) => l.gender === 'male' || l.gender === 'female')).toBe(true)
    expect(isTrainerLook('female-1')).toBe(true)
    expect(isTrainerLook('robo')).toBe(false)
    expect(isTrainerLook(DEFAULT_LOOK)).toBe(true)
  })

  it('o jogo novo guarda o visual escolhido e começa olhando para baixo', () => {
    expect(newGame(createMon(species, 5, 'me'), 'female-1').trainer).toEqual({ level: 1, xp: 0, look: 'female-1', facing: 'down' })
  })

  it('jogo salvo antes da escolha ganha o visual padrão e a direção para baixo', () => {
    const old = { ...newGame(createMon(species, 5, 'me'), 'female-1'), trainer: { level: 7, xp: 3 } } as unknown as GameState
    expect(withDefaults(old).trainer).toEqual({ level: 7, xp: 3, look: DEFAULT_LOOK, facing: 'down' })
    expect(withDefaults({ ...old, place: undefined } as unknown as GameState).place).toBe('outdoor')
  })
})

describe('elenco', () => {
  it('tem 4 masculinos e 4 femininos', () => {
    expect(TRAINER_LOOKS.filter((l) => l.gender === 'male')).toHaveLength(4)
    expect(TRAINER_LOOKS.filter((l) => l.gender === 'female')).toHaveLength(4)
  })
})
