import { describe, expect, it } from 'vitest'
import { availableMoves, battleTurn, createMon, evolveMon, isRefusal, movesOf, newGame, refreshSpecies, setMoves, startBattle, withDefaults, type GameState, type Mon, type Move, type Species, type Step } from './game'

const move = (name: string, level: number, power = 40, type = 'normal'): Move => ({ name, power, type, level, category: 'physical' })
const LEARNSET = [move('tackle', 1), move('ember', 4, 40, 'fire'), move('bite', 9, 60, 'dark'), move('flame-wheel', 15, 60, 'fire'), move('slash', 20, 70), move('flamethrower', 30, 90, 'fire')]

const species = (over: Partial<Species> = {}): Species => ({
  id: 4,
  name: 'charmander',
  types: ['fire'],
  sprite: '',
  backSprite: '',
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: LEARNSET,
  evolution: null,
  ...over
})

function ok(step: Step): GameState {
  if (isRefusal(step)) throw new Error(step.error)
  return step
}

describe('golpes por nível', () => {
  it('só os golpes até o nível do pokémon ficam disponíveis', () => {
    expect(availableMoves(createMon(species(), 9, 'a')).map((m) => m.name)).toEqual(['tackle', 'ember', 'bite'])
  })

  it('pokémon novo já vem com os 4 golpes mais recentes que aprendeu', () => {
    expect(createMon(species(), 20, 'a').moves).toEqual(['ember', 'bite', 'flame-wheel', 'slash'])
    expect(createMon(species(), 5, 'a').moves).toEqual(['tackle', 'ember'])
  })

  it('a batalha usa os golpes escolhidos, na ordem escolhida', () => {
    const mon = { ...createMon(species(), 30, 'a'), moves: ['flamethrower', 'tackle'] }
    expect(movesOf(mon).map((m) => m.name)).toEqual(['flamethrower', 'tackle'])
  })

  it('escolher golpes: de 1 a 4, sem repetir, só os que já aprendeu e fora da batalha', () => {
    const mon = createMon(species(), 20, 'a')
    const game = newGame(mon, 'male-1')
    expect(ok(setMoves(game, 'a', ['slash', 'tackle'])).team[0].moves).toEqual(['slash', 'tackle'])
    expect(setMoves(game, 'a', [])).toEqual({ error: 'Escolha de 1 a 4 golpes' })
    expect(setMoves(game, 'a', ['a', 'b', 'c', 'd', 'e'])).toEqual({ error: 'Escolha de 1 a 4 golpes' })
    expect(setMoves(game, 'a', ['slash', 'slash'])).toEqual({ error: 'Golpe repetido' })
    expect(setMoves(game, 'a', ['flamethrower'])).toEqual({ error: 'flamethrower ainda não foi aprendido' })
    const wild = createMon(species(), 3, 'w')
    expect(setMoves(startBattle(game, wild), 'a', ['slash'])).toEqual({ error: 'Termine a batalha primeiro' })
  })

  it('escolhe também para o pokémon no computador', () => {
    const game = { ...newGame(createMon(species(), 5, 'a'), 'male-1'), pc: [createMon(species(), 20, 'b')] }
    expect(ok(setMoves(game, 'b', ['slash'])).pc[0].moves).toEqual(['slash'])
  })

  it('subir de nível com vaga aprende o golpe novo sozinho', () => {
    const me: Mon = { ...createMon(species({ stats: { hp: 50, attack: 255, defense: 50, spAttack: 255, spDefense: 50, speed: 255 } }), 8, 'a'), moves: ['tackle', 'ember'] }
    const wild = { ...createMon(species({ id: 16 }), 10, 'w'), hp: 1 }
    const after = ok(battleTurn(startBattle(newGame(me, 'male-1'), wild), { kind: 'fight', move: 0 }, () => 0.5))
    expect(after.team[0].level).toBeGreaterThanOrEqual(9)
    expect(after.team[0].moves).toEqual(['tackle', 'ember', 'bite'])
    expect(after.battle!.log).toContain('Charmander aprendeu bite!')
  })

  it('subir de nível com os 4 golpes cheios avisa no registro e não troca sozinho', () => {
    const strong = { hp: 50, attack: 255, defense: 50, spAttack: 255, spDefense: 50, speed: 255 }
    const four: Mon = { ...createMon(species({ stats: strong, moves: [...LEARNSET, move('heat-wave', 15, 95, 'fire')] }), 14, 'a'), moves: ['tackle', 'ember', 'bite', 'flame-wheel'] }
    const wild = { ...createMon(species({ id: 16 }), 30, 'w'), hp: 1 }
    const after = ok(battleTurn(startBattle(newGame(four, 'male-1'), wild), { kind: 'fight', move: 0 }, () => 0.5))
    expect(after.team[0].level).toBeGreaterThanOrEqual(15)
    expect(after.team[0].moves).toEqual(['tackle', 'ember', 'bite', 'flame-wheel'])
    expect(after.battle!.log).toContain('Charmander aprendeu heat-wave! Troque no Computador.')
    expect(after.battle!.log.filter((l) => l.includes('aprendeu'))).toHaveLength(1)
  })

  it('evoluir mantém os golpes que existem na nova espécie e completa as vagas', () => {
    const charmeleon = species({ id: 5, name: 'charmeleon', moves: [move('ember', 1, 40, 'fire'), move('dragon-rage', 1, 40, 'dragon'), move('slash', 20, 70)] })
    const mon = { ...createMon(species({ evolution: { id: 5, level: 100, name: 'charmeleon' } }), 100, 'a'), moves: ['ember', 'tackle'] }
    const evolved = ok(evolveMon({ ...newGame(mon, 'male-1'), bag: { 'stone-fire': 1 } }, 'a', charmeleon)).team[0]
    expect(evolved.moves).toEqual(['ember', 'dragon-rage', 'slash'])
  })

  it('save com a espécie velha ganha a lista atual de golpes: mantém os escolhidos e completa as vagas', () => {
    const stale = species({ moves: LEARNSET.slice(0, 2) })
    const old: Mon = { ...createMon(stale, 126, 'c'), moves: ['tackle', 'ember'], hp: 7 }
    const wild = createMon(species({ id: 16, moves: LEARNSET.slice(0, 1) }), 10, 'w')
    const game = startBattle({ ...newGame(old, 'male-1'), pc: [{ ...old, uid: 'p' }] }, wild)
    const fresh = refreshSpecies(game, new Map([[4, species()], [16, species({ id: 16 })]]))
    expect(fresh.team[0]).toMatchObject({ level: 126, hp: 7, moves: ['tackle', 'ember', 'slash', 'flamethrower'] })
    expect(availableMoves(fresh.team[0]).map((m) => m.name)).toEqual(LEARNSET.map((m) => m.name))
    expect(fresh.pc[0].species.moves).toHaveLength(LEARNSET.length)
    expect(fresh.battle!.wild.species.moves).toHaveLength(LEARNSET.length)
    expect(refreshSpecies(game, new Map()).team[0].species.moves).toHaveLength(2)
  })

  it('save antigo: golpe sem nível conta como nível 1 e o pokémon ganha a lista de golpes', () => {
    const oldSpecies = { ...species(), moves: [{ name: 'scratch', power: 40, type: 'normal' }] } as unknown as Species
    const oldMon = { uid: 'a', species: oldSpecies, level: 5, xp: 0, hp: 10, heldItem: null } as unknown as Mon
    const game = withDefaults({ ...newGame(createMon(species(), 5, 'x'), 'male-1'), team: [oldMon], pc: [] })
    expect(game.team[0].species.moves).toEqual([move('scratch', 1)])
    expect(game.team[0].moves).toEqual(['scratch'])
  })
})
