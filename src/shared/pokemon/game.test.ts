import { describe, expect, it } from 'vitest'
import {
  battleTurn,
  buyItem,
  canEvolve,
  catchChance,
  createMon,
  damage,
  depositMon,
  endBattle,
  evolutionLevel,
  evolveMon,
  gainXp,
  healTeam,
  holdItem,
  isRefusal,
  maxHp,
  newGame,
  startBattle,
  STONE_DROP_CHANCE,
  CAUGHT_MAX_LEVEL,
  TEAM_LIMIT,
  withdrawMon,
  type GameState,
  withDefaults,
  type Mon,
  type Species,
  type Step
} from './game'
import { CENTER_SPAWN, START } from './map'

const species = (id: number, over: Partial<Species> = {}): Species => ({
  id,
  name: `mon-${id}`,
  types: ['normal'],
  sprite: '',
  backSprite: '',
  stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 50 },
  moves: [{ name: 'tackle', power: 40, type: 'normal', level: 1, category: 'physical' as const }],
  evolution: null,
  ...over
})

const always = (value: number) => () => value
let uid = 0
const mon = (over: Partial<Species> = {}, level = 5, extra: Partial<Mon> = {}): Mon => ({ ...createMon(species(++uid, over), level, `u${uid}`), ...extra })
const fast = { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 90 }
const strong = { hp: 50, attack: 255, defense: 50, spAttack: 255, spDefense: 50, speed: 90 }

function ok(step: Step): GameState {
  if (isRefusal(step)) throw new Error(step.error)
  return step
}

function inBattle(team: Mon[], wild: Mon, over: Partial<GameState> = {}): GameState {
  return startBattle({ ...newGame(team[0], 'male-1'), team, ...over }, wild)
}

const fightOnce = (me: Mon, wild: Mon, rng = always(0.5), over: Partial<GameState> = {}) =>
  ok(battleTurn(inBattle([me], wild, over), { kind: 'fight', move: 0 }, rng))

describe('monstros', () => {
  it('HP máximo pelo nível, sem teto de 100', () => {
    expect(maxHp(mon({}, 5))).toBe(20)
    expect(maxHp(mon({}, 50))).toBe(110)
    expect(maxHp(mon({}, 200))).toBe(410)
  })

  it('dano cresce com o poder, golpe do mesmo tipo bate mais e o mínimo é 1', () => {
    const d = mon()
    expect(damage(mon(), d, { name: 'x', power: 80, type: 'fire', level: 1, category: 'physical' as const }, 1)).toBeGreaterThan(damage(mon(), d, { name: 'y', power: 40, type: 'fire', level: 1, category: 'physical' as const }, 1))
    const move = { name: 't', power: 60, type: 'normal', level: 1, category: 'physical' as const }
    expect(damage(mon({ types: ['normal'] }), d, move, 1)).toBeGreaterThan(damage(mon({ types: ['fire'] }), d, move, 1))
    expect(damage(mon(), mon({ stats: { hp: 50, attack: 50, defense: 255, spAttack: 50, spDefense: 255, speed: 50 } }), { name: 'z', power: 1, type: 'fire', level: 1, category: 'physical' as const }, 0.85)).toBe(1)
  })

  it('captura mais fácil com HP baixo; a bola multiplica a chance: Poké 1x, Great 2x, Ultra 5x, Beast 10x', () => {
    const full = mon()
    expect(catchChance({ ...full, hp: 1 }, 'pokeball')).toBeGreaterThan(catchChance(full, 'pokeball'))
    const base = catchChance(full, 'pokeball')
    expect(catchChance(full, 'greatball')).toBeCloseTo(Math.min(1, base * 2))
    expect(catchChance(full, 'ultraball')).toBeCloseTo(Math.min(1, base * 5))
    expect(catchChance(full, 'beastball')).toBeCloseTo(Math.min(1, base * 10))
  })
})

describe('XP', () => {
  it('cada nível pede nível × 10 de XP e sobra passa para o próximo', () => {
    expect(gainXp({ level: 1, xp: 0 }, 9)).toEqual({ level: 1, xp: 9 })
    expect(gainXp({ level: 1, xp: 0 }, 10)).toEqual({ level: 2, xp: 0 })
    expect(gainXp({ level: 1, xp: 0 }, 35)).toEqual({ level: 3, xp: 5 })
  })

  it('vencer dá XP = nível do selvagem × 10 ao pokémon e o mesmo ao treinador', () => {
    const me = mon({ stats: strong }, 30)
    const after = fightOnce(me, mon({}, 7))
    expect(after.team[0]).toMatchObject({ level: 30, xp: 70 })
    expect(after.trainer).toMatchObject({ level: 4, xp: 10 })
  })

  it('subir de nível aumenta o HP junto', () => {
    const me = mon({ stats: { hp: 50, attack: 255, defense: 50, spAttack: 255, spDefense: 50, speed: 255 } }, 3)
    const after = fightOnce(me, mon({}, 6, { hp: 1 }))
    expect(after.team[0].level).toBe(4)
    expect(after.team[0].hp).toBe(maxHp(after.team[0]))
  })

  it('Lucky Egg dá 50% a mais de XP (o treinador ganha o mesmo)', () => {
    const me = mon({ stats: strong }, 30, { heldItem: 'lucky-egg' })
    const after = fightOnce(me, mon({}, 4))
    expect(after.team[0].xp).toBe(60)
    expect(after.trainer).toMatchObject({ level: 4, xp: 0 })
  })
})

describe('batalha', () => {
  it('lutar tira HP do selvagem e o selvagem revida', () => {
    const me = mon({ stats: fast })
    const wild = mon()
    const after = fightOnce(me, wild)
    expect(after.battle!.wild.hp).toBeLessThan(wild.hp)
    expect(after.team[0].hp).toBeLessThan(me.hp)
  })

  it('vencer paga ₽20 por nível do selvagem', () => {
    expect(fightOnce(mon({ stats: strong }, 30), mon({}, 3)).money).toBe(newGame(mon(), 'male-1').money + 60)
  })

  it(`pedra do primeiro tipo do selvagem cai com ${STONE_DROP_CHANCE * 100}% de chance`, () => {
    expect(STONE_DROP_CHANCE).toBe(0.01)
    const wild = mon({ types: ['rock', 'ground'] }, 3)
    expect(fightOnce(mon({ stats: strong }, 30), wild, always(0)).bag['stone-rock']).toBe(1)
    expect(fightOnce(mon({ stats: strong }, 30), wild, always(0.5)).bag['stone-rock']).toBeUndefined()
  })

  it('selvagem Sombrio deixa a Pedra das Trevas, a mesma de Fantasma', () => {
    const wild = mon({ types: ['dark'] }, 3)
    expect(fightOnce(mon({ stats: strong }, 30), wild, always(0)).bag['stone-ghost']).toBe(1)
  })

  it('derrubar o selvagem dá uma última chance de jogar uma bola: captura ou a luta acaba', () => {
    const quick = mon({ stats: strong }, 30)
    const won = fightOnce(quick, mon({}, 3))
    expect(won.battle).toMatchObject({ outcome: 'won', lastChance: true })
    const caught = ok(battleTurn(won, { kind: 'item', item: 'pokeball' }, always(0)))
    expect(caught.battle).toMatchObject({ outcome: 'caught', lastChance: false })
    expect(caught.team).toHaveLength(2)
    expect(caught.team[1].hp).toBe(1)
    expect(caught.bag.pokeball).toBe(won.bag.pokeball - 1)
    const missed = ok(battleTurn(won, { kind: 'item', item: 'pokeball' }, always(0.99)))
    expect(missed.battle).toMatchObject({ outcome: 'won', lastChance: false })
    expect(missed.team).toHaveLength(1)
    expect(missed.team[0].hp).toBe(won.team[0].hp)
    expect(missed.battle!.log.at(-1)).toBe(`${missed.battle!.wild.species.name.replace(/^./, (c) => c.toUpperCase())} escapou! A batalha acabou.`)
    expect(battleTurn(missed, { kind: 'item', item: 'pokeball' }, always(0))).toEqual({ error: 'A batalha já acabou' })
    expect(battleTurn(won, { kind: 'fight', move: 0 }, always(0))).toEqual({ error: 'A batalha já acabou' })
    expect(battleTurn(won, { kind: 'item', item: 'potion' }, always(0))).toEqual({ error: 'A batalha já acabou' })
  })

  it('fugir mais rápido sempre dá certo; fuga que falha deixa o selvagem atacar', () => {
    expect(ok(battleTurn(inBattle([mon({ stats: fast })], mon()), { kind: 'run' }, always(0.99))).battle!.outcome).toBe('fled')
    const slow = mon({ stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 10 } })
    const after = ok(battleTurn(inBattle([slow], mon()), { kind: 'run' }, always(0.99)))
    expect(after.battle!.outcome).toBeNull()
    expect(after.team[0].hp).toBeLessThan(slow.hp)
  })

  it('bola gasta da mochila, captura, paga ₽10 por nível e não dá pedra', () => {
    const me = mon()
    const wild = mon({}, 4)
    const after = ok(battleTurn(inBattle([me], wild), { kind: 'item', item: 'pokeball' }, always(0)))
    expect(after.bag.pokeball).toBe(9)
    expect(after.battle!.outcome).toBe('caught')
    expect(after.team.map((m) => m.uid)).toEqual([me.uid, wild.uid])
    expect(after.money).toBe(newGame(me, 'male-1').money + 40)
    expect(Object.keys(after.bag).some((k) => k.startsWith('stone-'))).toBe(false)
  })

  it(`capturado entra no máximo no nível ${CAUGHT_MAX_LEVEL}, com HP proporcional e só os golpes desse nível`, () => {
    expect(CAUGHT_MAX_LEVEL).toBe(20)
    const learnset = [
      { name: 'tackle', power: 40, type: 'normal', level: 1, category: 'physical' as const },
      { name: 'ember', power: 40, type: 'fire', level: 15, category: 'special' as const },
      { name: 'flamethrower', power: 90, type: 'fire', level: 30, category: 'special' as const }
    ]
    const strongWild = mon({ moves: learnset }, 146)
    const wild = { ...strongWild, hp: Math.floor(maxHp(strongWild) / 2), xp: 500 }
    const after = ok(battleTurn(inBattle([mon()], wild), { kind: 'item', item: 'pokeball' }, always(0)))
    const caught = after.team[1]
    expect(caught).toMatchObject({ level: 20, xp: 0, moves: ['tackle', 'ember'] })
    expect(caught.hp).toBe(Math.round((wild.hp / maxHp(wild)) * maxHp(caught)))
    expect(caught.hp).toBeLessThan(maxHp(caught))
    expect(after.money).toBe(newGame(mon(), 'male-1').money + 146 * 10)
    expect(ok(battleTurn(inBattle([mon()], mon({}, 7)), { kind: 'item', item: 'pokeball' }, always(0))).team[1].level).toBe(7)
  })

  it('com 5 na equipe o capturado vai para o computador', () => {
    expect(TEAM_LIMIT).toBe(5)
    const team = Array.from({ length: 5 }, () => mon())
    const wild = mon()
    const after = ok(battleTurn(inBattle(team, wild), { kind: 'item', item: 'pokeball' }, always(0)))
    expect(after.team).toHaveLength(5)
    expect(after.pc.map((m) => m.uid)).toEqual([wild.uid])
  })

  it('item que não tem, ou que não é de batalha, é recusado', () => {
    const game = inBattle([mon()], mon(), { bag: { 'choice-band': 1 } })
    expect(battleTurn(game, { kind: 'item', item: 'ultraball' }, always(0))).toEqual({ error: 'Você não tem esse item' })
    expect(battleTurn(game, { kind: 'item', item: 'choice-band' }, always(0))).toEqual({ error: 'Esse item não pode ser usado na batalha' })
  })

  it('poções curam uma parte do HP máximo: Poção 10%, Super 30%, Hiper 60%; Poção Máxima enche', () => {
    const me = { ...mon({ types: ['ghost'] }, 30), hp: 1 }
    const healed = (item: string) => ok(battleTurn(inBattle([me], mon({}, 2), { bag: { [item]: 1 } }), { kind: 'item', item }, always(0.5))).team[0].hp
    expect(healed('potion')).toBe(1 + Math.floor(maxHp(me) * 0.1))
    expect(healed('super-potion')).toBe(1 + Math.floor(maxHp(me) * 0.3))
    expect(healed('hyper-potion')).toBe(1 + Math.floor(maxHp(me) * 0.6))
    const max = ok(battleTurn(inBattle([me], mon({}, 2), { bag: { 'max-potion': 1 } }), { kind: 'item', item: 'max-potion' }, always(0.5)))
    expect(max.team[0].hp).toBeGreaterThan(maxHp(me) - 5)
    expect(max.bag['max-potion']).toBeUndefined()
  })

  it('quem tem mais speed ataca primeiro; o mais lento ataca depois', () => {
    const quick = mon({ stats: fast }, 30)
    const slow = mon({ stats: { ...fast, speed: 10 } }, 30)
    expect(ok(battleTurn(inBattle([quick], mon({ stats: { ...fast, speed: 20 } }, 30)), { kind: 'fight', move: 0 }, always(0.5))).battle!.hits.map((h) => h.by)).toEqual(['player', 'wild'])
    expect(ok(battleTurn(inBattle([slow], mon({ stats: fast }, 30)), { kind: 'fight', move: 0 }, always(0.5))).battle!.hits.map((h) => h.by)).toEqual(['wild', 'player'])
  })

  it('o mais rápido que derruba o mais lento impede o ataque dele', () => {
    const quickStrong = mon({ stats: { ...strong, speed: 90 } }, 60)
    const slowWild = mon({ stats: { ...fast, speed: 10 } }, 2)
    const won = ok(battleTurn(inBattle([quickStrong], slowWild), { kind: 'fight', move: 0 }, always(0.5)))
    expect(won.battle!.outcome).toBe('won')
    expect(won.battle!.hits.map((h) => h.by)).toEqual(['player'])
    expect(won.team[0].hp).toBe(quickStrong.hp)
    const slowMe = { ...mon({ stats: { ...fast, speed: 10 } }, 30), hp: 1 }
    const quickWild = mon({ stats: { ...strong, speed: 90 } }, 30)
    const lost = ok(battleTurn(inBattle([slowMe, mon({}, 30)], quickWild), { kind: 'fight', move: 0 }, always(0.5)))
    expect(lost.battle!.hits.map((h) => h.by)).toEqual(['wild'])
    expect(lost.battle!.wild.hp).toBe(quickWild.hp)
    expect(lost.battle!.mustSwitch).toBe(true)
  })

  it('o turno guarda os golpes na ordem, com tipo e eficácia, para a tela animar', () => {
    const me = mon({ types: ['water'], stats: fast }, 30, { moves: [] })
    const fireWild = mon({ types: ['fire'] }, 30)
    const water = { name: 'water-gun', power: 40, type: 'water', level: 1, category: 'special' as const }
    const meWater = { ...me, species: { ...me.species, moves: [water] }, moves: ['water-gun'] }
    const after = ok(battleTurn(inBattle([meWater], fireWild), { kind: 'fight', move: 0 }, always(0.5)))
    expect(after.battle!.hits).toEqual([
      { by: 'player', type: 'water', factor: 2 },
      { by: 'wild', type: 'normal', factor: 1 }
    ])
    const next = ok(battleTurn(after, { kind: 'run' }, always(0)))
    expect(next.battle!.hits).toEqual([])
  })

  it('batalha nova e save antigo começam sem golpes no turno', () => {
    const fresh = inBattle([mon()], mon())
    expect(fresh.battle!.hits).toEqual([])
    const old = { ...fresh, battle: { ...fresh.battle!, hits: undefined } } as unknown as GameState
    expect(withDefaults(old).battle!.hits).toEqual([])
  })

  it('Revive volta um desmaiado da equipe com 30% do HP e gasta o turno', () => {
    const me = mon({}, 30)
    const down = { ...mon({}, 30), hp: 0 }
    const after = ok(battleTurn(inBattle([me, down], mon({}, 2), { bag: { revive: 1 } }), { kind: 'item', item: 'revive', target: down.uid }, always(0.5)))
    expect(after.team[1].hp).toBe(Math.floor(maxHp(down) * 0.3))
    expect(after.bag.revive).toBeUndefined()
    expect(after.battle!.activeUid).toBe(me.uid)
    expect(after.team[0].hp).toBeLessThan(me.hp)
  })

  it('Max Revive volta com o HP cheio', () => {
    const down = { ...mon({}, 30), hp: 0 }
    const after = ok(battleTurn(inBattle([mon({}, 30), down], mon({}, 2), { bag: { 'max-revive': 1 } }), { kind: 'item', item: 'max-revive', target: down.uid }, always(0.5)))
    expect(after.team[1].hp).toBe(maxHp(down))
  })

  it('Revive só em pokémon desmaiado da equipe', () => {
    const me = mon({}, 30)
    const game = inBattle([me, mon({}, 30)], mon({}, 2), { bag: { revive: 1 } })
    expect(battleTurn(game, { kind: 'item', item: 'revive' }, always(0.5))).toEqual({ error: 'Escolha um pokémon desmaiado' })
    expect(battleTurn(game, { kind: 'item', item: 'revive', target: me.uid }, always(0.5))).toEqual({ error: 'Escolha um pokémon desmaiado' })
    expect(battleTurn(game, { kind: 'item', item: 'revive', target: 'ninguem' }, always(0.5))).toEqual({ error: 'Escolha um pokémon desmaiado' })
  })

  it('trocar põe outro da equipe; não troca para desmaiado', () => {
    const a = mon()
    const b = mon()
    expect(ok(battleTurn(inBattle([a, b], mon()), { kind: 'switch', uid: b.uid }, always(0.5))).battle!.activeUid).toBe(b.uid)
    const fainted = { ...mon(), hp: 0 }
    expect(isRefusal(battleTurn(inBattle([a, fainted], mon()), { kind: 'switch', uid: fainted.uid }, always(0.5)))).toBe(true)
  })

  it('pokémon que desmaia obriga a trocar', () => {
    const me = { ...mon({ stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 1 } }), hp: 1 }
    const after = fightOnce(me, mon({}, 30), always(0.5), { team: [me, mon()] })
    expect(after.battle!.mustSwitch).toBe(true)
    expect(battleTurn(after, { kind: 'run' }, always(0))).toEqual({ error: 'Escolha outro pokémon' })
  })

  it('equipe toda desmaiada perde, cura e acorda dentro do Centro Pokémon', () => {
    const me = { ...mon({ stats: { hp: 50, attack: 50, defense: 50, spAttack: 50, spDefense: 50, speed: 1 } }), hp: 1 }
    const after = fightOnce(me, mon({}, 30))
    expect(after.battle!.outcome).toBe('lost')
    expect(after.team[0].hp).toBe(maxHp(me))
    expect(after.place).toBe('center')
    expect(after.pos).toEqual(CENTER_SPAWN)
  })

  it('só sai da batalha depois que ela acaba', () => {
    const game = inBattle([mon()], mon())
    expect(isRefusal(endBattle(game))).toBe(true)
    expect(ok(endBattle(ok(battleTurn(game, { kind: 'run' }, always(0))))).battle).toBeNull()
  })
})

describe('itens segurados', () => {
  const move = { name: 'ember', power: 60, type: 'fire', level: 1, category: 'physical' as const }

  it('Charcoal aumenta golpe de Fogo; Choice Band aumenta todos', () => {
    const d = mon()
    const plain = damage(mon(), d, move, 1)
    expect(damage(mon({}, 5, { heldItem: 'charcoal' }), d, move, 1)).toBeGreaterThan(plain)
    expect(damage(mon({}, 5, { heldItem: 'mystic-water' }), d, move, 1)).toBe(plain)
    expect(damage(mon({}, 5, { heldItem: 'choice-band' }), d, move, 1)).toBeGreaterThan(damage(mon({}, 5, { heldItem: 'charcoal' }), d, move, 1))
  })

  it('Quick Claw pode fazer o mais lento atacar primeiro', () => {
    const slow = mon({ stats: { hp: 50, attack: 255, defense: 50, spAttack: 255, spDefense: 50, speed: 1 } }, 20, { heldItem: 'quick-claw' })
    const after = fightOnce(slow, mon({ stats: fast }, 3), always(0))
    expect(after.battle!.outcome).toBe('won')
    expect(after.team[0].hp).toBe(slow.hp)
  })

  it('Leftovers recupera 1/16 do HP no fim do turno', () => {
    const me = { ...mon({ stats: fast }, 50, { heldItem: 'leftovers' }), hp: 50 }
    const after = ok(battleTurn(inBattle([me], mon({ stats: { hp: 255, attack: 1, defense: 255, spAttack: 1, spDefense: 255, speed: 1 } }, 50)), { kind: 'fight', move: 0 }, always(0.5)))
    expect(after.battle!.log.at(-1)).toContain('Leftovers')
    expect(after.team[0].hp).toBeGreaterThan(50 - 2)
  })

  it('segurar tira da mochila e devolve o anterior; soltar devolve', () => {
    const me = mon()
    const game = { ...newGame(me, 'male-1'), bag: { leftovers: 1, charcoal: 1 } }
    const holding = ok(holdItem(game, me.uid, 'leftovers'))
    expect(holding.team[0].heldItem).toBe('leftovers')
    expect(holding.bag).toEqual({ charcoal: 1 })
    const swapped = ok(holdItem(holding, me.uid, 'charcoal'))
    expect(swapped.bag).toEqual({ leftovers: 1 })
    expect(ok(holdItem(swapped, me.uid, null)).bag).toEqual({ leftovers: 1, charcoal: 1 })
    expect(holdItem(game, me.uid, 'pokeball')).toEqual({ error: 'Esse item não pode ser segurado' })
    expect(holdItem(game, me.uid, 'lucky-egg')).toEqual({ error: 'Você não tem esse item' })
  })
})

describe('shop', () => {
  it('compra gasta o dinheiro e põe na mochila', () => {
    const game = { ...newGame(mon(), 'male-1'), money: 2000 }
    const after = ok(buyItem(game, 'greatball', 2))
    expect(after.money).toBe(800)
    expect(after.bag.greatball).toBe(2)
  })

  it('recusa sem dinheiro, quantidade inválida e item que não está à venda', () => {
    const game = { ...newGame(mon(), 'male-1'), money: 100 }
    expect(buyItem(game, 'pokeball', 1)).toEqual({ error: 'Dinheiro insuficiente' })
    expect(isRefusal(buyItem({ ...game, money: 1e9 }, 'pokeball', 0))).toBe(true)
    expect(isRefusal(buyItem({ ...game, money: 1e9 }, 'pokeball', 100))).toBe(true)
    expect(buyItem({ ...game, money: 1e9 }, 'stone-fire', 1)).toEqual({ error: 'Esse item não está à venda' })
  })
})

describe('Centro Pokémon', () => {
  const withTeam = (team: Mon[], over: Partial<GameState> = {}): GameState => ({ ...newGame(team[0], 'male-1'), team, ...over })

  it('o jogo começa fora do centro', () => {
    expect(newGame(mon(), 'male-1').place).toBe('outdoor')
  })

  it('curar enche o HP da equipe inteira', () => {
    const hurt = { ...mon(), hp: 1 }
    expect(healTeam(newGame(hurt, 'male-1')).team[0].hp).toBe(maxHp(hurt))
  })

  it('guarda e pega em qualquer lugar fora da batalha, sem esvaziar nem passar de 5', () => {
    const a = mon()
    const b = mon()
    expect(depositMon(startBattle(withTeam([a, b]), mon()), b.uid)).toEqual({ error: 'Termine a batalha primeiro' })
    expect(withdrawMon(startBattle(withTeam([a], { pc: [b] }), mon()), b.uid)).toEqual({ error: 'Termine a batalha primeiro' })
    const deposited = ok(depositMon(withTeam([a, b], { pos: START, place: 'outdoor' }), b.uid))
    expect(deposited.pc.map((m) => m.uid)).toEqual([b.uid])
    expect(isRefusal(depositMon(deposited, a.uid))).toBe(true)
    expect(ok(withdrawMon(deposited, b.uid)).team.map((m) => m.uid)).toEqual([a.uid, b.uid])
    const full = withTeam(Array.from({ length: 5 }, () => mon()), { pc: [b] })
    expect(isRefusal(withdrawMon(full, b.uid))).toBe(true)
  })
})

describe('evolução', () => {
  const squirtle = (level: number) => createMon(species(7, { name: 'squirtle', types: ['water'], evolution: { id: 8, level: evolutionLevel(0) } }), level, 'sq')
  const wartortle = species(8, { name: 'wartortle', types: ['water'], stats: { hp: 80, attack: 60, defense: 60, spAttack: 60, spDefense: 60, speed: 60 } })
  const withBag = (m: Mon, bag: GameState['bag']): GameState => ({ ...newGame(m, 'male-1'), bag })

  it('1ª evolução no nível 100, 2ª no 200', () => {
    expect(evolutionLevel(0)).toBe(100)
    expect(evolutionLevel(1)).toBe(200)
  })

  it('precisa do nível e da pedra do primeiro tipo', () => {
    expect(canEvolve(squirtle(100), { 'stone-water': 1 })).toBe(true)
    expect(canEvolve(squirtle(99), { 'stone-water': 1 })).toBe(false)
    expect(canEvolve(squirtle(100), { 'stone-fire': 1 })).toBe(false)
    expect(canEvolve(createMon(species(9, { evolution: null }), 300, 'b'), { 'stone-normal': 3 })).toBe(false)
  })

  it('evoluir gasta a pedra, troca a espécie e mantém nível, XP e HP perdido', () => {
    const m = { ...squirtle(100), hp: maxHp(squirtle(100)) - 5, xp: 7 }
    const evolved = ok(evolveMon(withBag(m, { 'stone-water': 2 }), 'sq', wartortle))
    expect(evolved.bag).toEqual({ 'stone-water': 1 })
    expect(evolved.team[0]).toMatchObject({ uid: 'sq', level: 100, xp: 7, species: wartortle })
    expect(evolved.team[0].hp).toBe(maxHp(evolved.team[0]) - 5)
  })

  it('evolui no computador também; recusa com o motivo', () => {
    const game = { ...withBag(createMon(species(1), 5, 'x'), { 'stone-water': 1 }), pc: [squirtle(100)] }
    expect(ok(evolveMon(game, 'sq', wartortle)).pc[0].species).toBe(wartortle)
    expect(evolveMon(withBag(squirtle(50), { 'stone-water': 1 }), 'sq', wartortle)).toEqual({ error: 'Squirtle evolui no nível 100' })
    expect(evolveMon(withBag(squirtle(100), {}), 'sq', wartortle)).toEqual({ error: "Precisa de uma Pedra d'Água" })
  })
})
