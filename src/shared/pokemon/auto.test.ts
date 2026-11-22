import { describe, expect, it } from 'vitest'
import { autoAction, CATCH_BELOW, type AutoSettings } from './auto'
import { createMon, maxHp, newGame, startBattle, type GameState, type Mon, type Move, type Species } from './game'
import { CENTER_SPAWN, MAPS } from './map'

const move = (name: string, power: number, type = 'normal'): Move => ({ name, power, type, level: 1, category: 'physical' })
const species = (id: number, over: Partial<Species> = {}): Species => ({
  id,
  name: `mon-${id}`,
  types: ['fire'],
  sprite: '',
  backSprite: '',
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [move('tackle', 40), move('ember', 40, 'fire'), move('slam', 80)],
  evolution: null,
  ...over
})
const ON: AutoSettings = { fight: true, catch: true, balls: ['greatball', 'pokeball'] }
const always = (v: number) => () => v
const me = (): Mon => ({ ...createMon(species(4), 10, 'me'), moves: ['tackle', 'ember', 'slam'] })
const outdoors = (over: Partial<GameState> = {}): GameState => ({ ...newGame(me(), 'male-1'), ...over })
const battle = (wildHp: (max: number) => number, over: Partial<GameState> = {}) => {
  const wild = createMon(species(16), 5, 'w')
  const game = startBattle(outdoors(over), { ...wild, hp: wildHp(maxHp(wild)) })
  return game
}

describe('AFK', () => {
  it('desligado não faz nada', () => {
    expect(autoAction(outdoors(), { ...ON, fight: false }, always(0))).toBeNull()
  })

  it('no mapa anda, preferindo o mato quando há mato do lado', () => {
    const nextToGrass = { x: 4, y: 5 }
    expect(MAPS.kanto[5][3]).toBe('G')
    expect(autoAction(outdoors({ pos: nextToGrass }), ON, always(0))).toEqual({ type: 'walk', dir: 'left' })
  })

  it('caçando, anda pelo mapa do tipo, onde fica o mato dele', () => {
    expect(MAPS.fire[2][2]).toBe('G')
    expect(MAPS.kanto[2][2]).toBe('A')
    expect(autoAction(outdoors({ pos: { x: 1, y: 2 }, biome: 'fire' }), ON, always(0))).toEqual({ type: 'walk', dir: 'right' })
  })

  it('sem mato do lado anda para qualquer lado livre, nunca contra a árvore', () => {
    const corner = { x: 13, y: 1 }
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const action = autoAction(outdoors({ pos: corner }), ON, always(r))
      expect(['right', 'down']).toContain(action && 'dir' in action ? action.dir : null)
    }
  })

  it('na batalha luta com o golpe mais forte, contando o bônus do mesmo tipo', () => {
    expect(autoAction(battle((max) => max), ON, always(0))).toEqual({ type: 'battle', action: { kind: 'fight', move: 2 } })
    const fireMe = { ...me(), moves: ['tackle', 'ember'] }
    expect(autoAction(startBattle(outdoors({ team: [fireMe] }), createMon(species(16, { types: ['normal'] }), 5, 'w')), ON, always(0))).toEqual({ type: 'battle', action: { kind: 'fight', move: 1 } })
  })

  it('conta a eficiência do tipo contra o selvagem', () => {
    const grass = createMon(species(1, { types: ['grass'] }), 5, 'w')
    expect(autoAction(startBattle(outdoors(), grass), ON, always(0))).toEqual({ type: 'battle', action: { kind: 'fight', move: 1 } })
  })

  it(`joga a pokébola marcada só com o selvagem abaixo de ${CATCH_BELOW * 100}% do HP`, () => {
    expect(CATCH_BELOW).toBe(0.1)
    const bag = { pokeball: 3, greatball: 0, ultraball: 5 }
    expect(autoAction(battle(() => 1, { bag }), ON, always(0))).toEqual({ type: 'battle', action: { kind: 'item', item: 'pokeball' } })
    expect(autoAction(battle((max) => Math.ceil(max * 0.5), { bag }), ON, always(0))).toMatchObject({ action: { kind: 'fight' } })
  })

  it('sem a bola marcada na mochila, ou com o Auto Catch desligado, só luta', () => {
    expect(autoAction(battle(() => 1, { bag: { ultraball: 5 } }), ON, always(0))).toMatchObject({ action: { kind: 'fight' } })
    expect(autoAction(battle(() => 1, { bag: { pokeball: 5 } }), { ...ON, catch: false }, always(0))).toMatchObject({ action: { kind: 'fight' } })
  })

  it('pokémon desmaiado: troca pelo primeiro vivo', () => {
    const fallen = { ...me(), hp: 0 }
    const friend = { ...createMon(species(7), 10, 'friend') }
    const game = battle((max) => max, { team: [fallen, friend] })
    const stuck = { ...game, battle: { ...game.battle!, activeUid: 'me', mustSwitch: true } }
    expect(autoAction(stuck, ON, always(0))).toEqual({ type: 'battle', action: { kind: 'switch', uid: 'friend' } })
  })

  it('batalha terminada: sai dela', () => {
    const game = battle((max) => max)
    expect(autoAction({ ...game, battle: { ...game.battle!, outcome: 'won' } }, ON, always(0))).toEqual({ type: 'leave-battle' })
  })

  it('derrubou o selvagem com o Auto Catch ligado: usa a última chance com a bola marcada', () => {
    const game = battle(() => 0, { bag: { pokeball: 3 } })
    const ko = { ...game, battle: { ...game.battle!, outcome: 'won' as const, lastChance: true } }
    expect(autoAction(ko, ON, always(0))).toEqual({ type: 'battle', action: { kind: 'item', item: 'pokeball' } })
    expect(autoAction(ko, { ...ON, catch: false }, always(0))).toEqual({ type: 'leave-battle' })
    expect(autoAction({ ...ko, bag: {} }, ON, always(0))).toEqual({ type: 'leave-battle' })
    expect(autoAction({ ...ko, battle: { ...ko.battle, lastChance: false } }, ON, always(0))).toEqual({ type: 'leave-battle' })
  })

  it('acordou no Centro Pokémon depois de perder: volta para a região', () => {
    expect(autoAction(outdoors({ place: 'center', pos: CENTER_SPAWN, region: 'kanto' }), ON, always(0))).toEqual({ type: 'travel', region: 'kanto' })
    expect(autoAction(outdoors({ place: 'center', pos: CENTER_SPAWN, region: 'kanto', hunt: 25 }), ON, always(0))).toEqual({ type: 'travel', region: 'kanto', hunt: 25 })
  })
})
