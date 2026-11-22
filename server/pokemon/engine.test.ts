import { describe, expect, it } from 'vitest'
import { createMon, maxHp, newGame, startBattle, type GameState, type Species, withDefaults } from '../../src/shared/pokemon/game'
import { CENTER_SPAWN, MAPS, START } from '../../src/shared/pokemon/map'
import { parseAction, runAction, type EngineDeps, type EngineResult } from './engine'

const species = (id: number, over: Partial<Species> = {}): Species => ({
  id,
  name: `mon-${id}`,
  types: ['normal'],
  sprite: '',
  backSprite: '',
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [{ name: 'tackle', power: 40, type: 'normal', level: 1, category: 'physical' }],
  evolution: null,
  ...over
})

function deps(random = 0.5, catalog: Record<number, Partial<Species>> = {}): EngineDeps & { asked: number[] } {
  const asked: number[] = []
  let n = 0
  return {
    asked,
    rng: () => random,
    uid: () => `uid-${++n}`,
    species: async (id) => {
      asked.push(id)
      return species(id, catalog[id])
    },
    huntInfo: async (id) => ({ base: id !== 5, legendary: id === 150 })
  }
}

function game(result: EngineResult): GameState {
  if ('error' in result) throw new Error(result.error)
  return result.game
}

const base = (level = 5, over: Partial<GameState> = {}): GameState => ({ ...newGame(createMon(species(4), level, 'me'), 'male-1'), ...over })

describe('motor do jogo', () => {
  it('começa com um dos 3 iniciais no nível 5, só uma vez', async () => {
    const d = deps()
    const started = game(await runAction(null, { type: 'start', starter: 4, look: 'female-1' }, d))
    expect(d.asked).toEqual([4])
    expect(started.team[0]).toMatchObject({ uid: 'uid-1', level: 5 })
    expect(await runAction(null, { type: 'start', starter: 25, look: 'female-1' }, d)).toEqual({ error: 'Escolha um dos pokémon iniciais' })
    expect(await runAction(started, { type: 'start', starter: 1, look: 'female-1' }, d)).toEqual({ error: 'Você já começou o jogo' })
    expect(await runAction(null, { type: 'enter-center' }, d)).toEqual({ error: 'Escolha seu primeiro pokémon' })
  })

  it('andar no mato com sorteio baixo encontra selvagem da região, na faixa do nível do pokémon', async () => {
    const d = deps(0)
    const g = base(50, { region: 'johto', trainer: { level: 100, xp: 0, look: 'male-1', facing: 'down' }, pos: { x: 2, y: 3 } })
    const result = game(await runAction(g, { type: 'walk', dir: 'down' }, d))
    expect(d.asked).toEqual([152])
    expect(result.battle?.wild.level).toBe(44)
  })

  it('caçar um pokémon leva para a região dele e todo mato encontra só ele', async () => {
    const hunting = game(await runAction(base(50, { trainer: { level: 100, xp: 0, look: 'male-1', facing: 'down' } }), { type: 'travel', region: 'johto', hunt: 175 }, deps()))
    expect(hunting).toMatchObject({ region: 'johto', hunt: 175 })
    const d = deps(0)
    const result = game(await runAction({ ...hunting, pos: { x: 2, y: 3 } }, { type: 'walk', dir: 'down' }, d))
    expect(d.asked).toEqual([175])
    expect(result.battle?.wild.level).toBe(44)
    expect(game(await runAction(hunting, { type: 'travel', region: 'johto' }, deps())).hunt).toBeNull()
  })

  it('caçar abre o mapa do 1º tipo do pokémon, no começo dele; sem caçada volta o mapa comum', async () => {
    const d = deps(0.5, { 37: { types: ['fire', 'normal'] } })
    const hunting = game(await runAction(base(10, { pos: { x: 3, y: 3 } }), { type: 'travel', region: 'kanto', hunt: 37 }, d))
    expect(hunting).toMatchObject({ biome: 'fire', pos: START, hunt: 37 })
    const inFire = game(await runAction({ ...hunting, pos: { x: 1, y: 2 } }, { type: 'walk', dir: 'right' }, deps(0, { 37: { types: ['fire'] } })))
    expect(inFire.battle?.wild.species.id).toBe(37)
    const field = game(await runAction({ ...hunting, biome: null, hunt: null, pos: { x: 1, y: 2 } }, { type: 'walk', dir: 'right' }, deps(0)))
    expect(field.battle).toBeNull()
    expect(game(await runAction(hunting, { type: 'travel', region: 'kanto' }, d))).toMatchObject({ biome: null, hunt: null, pos: START })
    const noMap = game(await runAction(base(), { type: 'travel', region: 'kanto', hunt: 16 }, deps(0.5, { 16: { types: ['normal', 'flying'] } })))
    expect(noMap.biome).toBeNull()
  })

  it('caçada recusa pokémon de outra região, evolução, lendário e região bloqueada', async () => {
    expect(await runAction(base(), { type: 'travel', region: 'kanto', hunt: 152 }, deps())).toEqual({ error: 'Esse pokémon não é de Kanto' })
    expect(await runAction(base(), { type: 'travel', region: 'kanto', hunt: 150 }, deps())).toEqual({ error: 'Lendários e míticos não podem ser caçados' })
    expect(await runAction(base(), { type: 'travel', region: 'kanto', hunt: 5 }, deps())).toEqual({ error: 'Só a primeira forma do pokémon pode ser caçada' })
    expect(await runAction(base(), { type: 'travel', region: 'johto', hunt: 175 }, deps())).toEqual({ error: 'Região liberada no nível 100 de treinador' })
    expect(parseAction({ type: 'travel', region: 'kanto', hunt: 25 })).toEqual({ type: 'travel', region: 'kanto', hunt: 25 })
    expect(parseAction({ type: 'travel', region: 'kanto', hunt: 'pikachu' })).toBeNull()
  })

  it('jogo novo e save antigo começam sem caçada e no mapa comum', () => {
    expect(base()).toMatchObject({ hunt: null, biome: null })
    expect(withDefaults({ ...base(), hunt: undefined, biome: undefined } as unknown as GameState)).toMatchObject({ hunt: null, biome: null })
  })

  it('o início guarda o visual escolhido; visual desconhecido é recusado', async () => {
    expect(game(await runAction(null, { type: 'start', starter: 4, look: 'female-1' }, deps())).trainer.look).toBe('female-1')
    expect(await runAction(null, { type: 'start', starter: 4, look: 'robo' }, deps())).toEqual({ error: 'Escolha um dos treinadores' })
  })

  it('andar vira o treinador para a direção, mesmo batendo na árvore', async () => {
    const blocked = game(await runAction(base(5, { pos: { x: 1, y: 1 } }), { type: 'walk', dir: 'up' }, deps(0.9)))
    expect(blocked.pos).toEqual({ x: 1, y: 1 })
    expect(blocked.trainer.facing).toBe('up')
  })

  it('inicial e selvagem ganham natureza sorteada', async () => {
    expect(game(await runAction(null, { type: 'start', starter: 4, look: 'female-1' }, deps(0.999))).team[0].nature).toBe('quirky')
    const wild = game(await runAction(base(50, { pos: { x: 2, y: 4 } }), { type: 'walk', dir: 'down' }, deps(0))).battle!.wild
    expect(wild.nature).toBe('hardy')
  })

  it('andar no caminho só move e devolve o tile', async () => {
    const result = await runAction(base(), { type: 'walk', dir: 'left' }, deps(0))
    expect(result).toEqual({ game: { ...base(), pos: { x: START.x - 1, y: START.y }, trainer: { ...base().trainer, facing: 'left' } }, tile: 'path' })
  })

  it('região bloqueada até o nível de treinador', async () => {
    expect(await runAction(base(), { type: 'travel', region: 'johto' }, deps())).toEqual({ error: 'Região liberada no nível 100 de treinador' })
    expect(game(await runAction(base(5, { trainer: { level: 100, xp: 0, look: 'male-1', facing: 'down' } }), { type: 'travel', region: 'johto' }, deps())).region).toBe('johto')
  })

  it('evoluir busca a espécie seguinte no nível atual', async () => {
    const charmander = createMon(species(4, { types: ['fire'], evolution: { id: 5, level: 100 } }), 100, 'me')
    const d = deps(0.5, { 5: { name: 'charmeleon', types: ['fire'] } })
    const evolved = game(await runAction({ ...newGame(charmander, 'male-1'), bag: { 'stone-fire': 1 } }, { type: 'evolve', uid: 'me' }, d))
    expect(d.asked).toEqual([5])
    expect(evolved.team[0].species.name).toBe('charmeleon')
  })

  it('a aba Centro Pokémon leva para dentro, no tapete, olhando para cima', async () => {
    const inside = game(await runAction(base(), { type: 'enter-center' }, deps()))
    expect(inside).toMatchObject({ place: 'center', pos: CENTER_SPAWN, trainer: { facing: 'up' } })
    const battling = startBattle(base(), createMon(species(16), 3, 'w'))
    expect(await runAction(battling, { type: 'enter-center' }, deps())).toEqual({ error: 'Termine a batalha primeiro' })
  })

  it('clicar numa região sai do centro para o começo do mapa dela', async () => {
    const inside = { ...base(5, { trainer: { level: 100, xp: 0, look: 'male-1', facing: 'up' } }), place: 'center' as const, pos: CENTER_SPAWN }
    expect(game(await runAction(inside, { type: 'travel', region: 'johto' }, deps()))).toMatchObject({ place: 'outdoor', pos: START, region: 'johto' })
  })

  it('dentro do centro não tem pokémon selvagem e bater no balcão cura a equipe', async () => {
    const counterX = MAPS.center[1].indexOf('K')
    const hurt = { ...createMon(species(4), 5, 'me'), hp: 1 }
    const inside: GameState = { ...newGame(hurt, 'male-1'), place: 'center', pos: { x: counterX, y: 2 } }
    const d = deps(0)
    const result = await runAction(inside, { type: 'walk', dir: 'up' }, d)
    expect(result).toMatchObject({ tile: 'counter' })
    expect(game(result).team[0].hp).toBe(maxHp(hurt))
    expect(game(await runAction(inside, { type: 'walk', dir: 'down' }, d)).battle).toBeNull()
    expect(d.asked).toEqual([])
  })

  it('escolher golpes passa pela regra de golpes aprendidos', async () => {
    expect(await runAction(base(), { type: 'set-moves', uid: 'me', moves: ['hyper-beam'] }, deps())).toEqual({ error: 'hyper-beam ainda não foi aprendido' })
    expect(game(await runAction(base(), { type: 'set-moves', uid: 'me', moves: ['tackle'] }, deps())).team[0].moves).toEqual(['tackle'])
  })

  it('comprar no market', async () => {
    expect(game(await runAction(base(), { type: 'buy', item: 'greatball', quantity: 1 }, deps())).bag.greatball).toBe(1)
  })
})

describe('validação do que chega', () => {
  it('aceita ações bem formadas e recusa o resto', () => {
    expect(parseAction({ type: 'walk', dir: 'up' })).toEqual({ type: 'walk', dir: 'up' })
    expect(parseAction({ type: 'start', starter: 4, look: 'male-1' })).toEqual({ type: 'start', starter: 4, look: 'male-1' })
    expect(parseAction({ type: 'start', starter: 4 })).toBeNull()
    expect(parseAction({ type: 'battle', action: { kind: 'fight', move: 1 } })).toEqual({ type: 'battle', action: { kind: 'fight', move: 1 } })
    expect(parseAction({ type: 'battle', action: { kind: 'item', item: 'revive', target: 'x' } })).toEqual({ type: 'battle', action: { kind: 'item', item: 'revive', target: 'x' } })
    expect(parseAction({ type: 'battle', action: { kind: 'item', item: 'potion' } })).toEqual({ type: 'battle', action: { kind: 'item', item: 'potion' } })
    expect(parseAction({ type: 'battle', action: { kind: 'item', item: 'revive', target: 7 } })).toBeNull()
    expect(parseAction({ type: 'hold', uid: 'x', item: null })).toEqual({ type: 'hold', uid: 'x', item: null })
    expect(parseAction({ type: 'set-moves', uid: 'x', moves: ['a', 'b'] })).toEqual({ type: 'set-moves', uid: 'x', moves: ['a', 'b'] })
    expect(parseAction({ type: 'set-moves', uid: 'x', moves: [1] })).toBeNull()
    expect(parseAction({ type: 'walk', dir: 'diagonal' })).toBeNull()
    expect(parseAction({ type: 'battle', action: { kind: 'fight', move: 1.5 } })).toBeNull()
    expect(parseAction({ type: 'travel', region: 'atlantis' })).toBeNull()
    expect(parseAction({ type: 'cheat' })).toBeNull()
    expect(parseAction(null)).toBeNull()
  })
})
