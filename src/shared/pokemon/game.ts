import { BALLS, POTIONS, REVIVES, TYPE_BOOSTERS, isHoldItem, itemCategory, itemLabel, itemPrice, stoneId, type BallId, type HoldItemId, type PotionId, type ReviveId } from './items'
import { CENTER_SPAWN, START, type Dir, type Place, type Pos } from './map'
import { DEFAULT_REGION, type RegionId } from './regions'
import { DEFAULT_LOOK } from './trainers'
import { natureFactor, NEUTRAL_NATURE, type NatureStat } from './natures'
import { effectiveness, type PokemonType } from './types'

export interface Move {
  name: string
  power: number
  type: string
  level: number
  category: MoveCategory
}

export interface BaseStats {
  hp: number
  attack: number
  defense: number
  spAttack: number
  spDefense: number
  speed: number
}

export type MoveCategory = 'physical' | 'special'

export interface Evolution {
  id: number
  level: number
  name?: string
}

export interface Species {
  id: number
  name: string
  types: string[]
  sprite: string
  backSprite: string
  stats: BaseStats
  moves: Move[]
  evolution: Evolution | null
}

export interface Mon {
  uid: string
  species: Species
  level: number
  xp: number
  hp: number
  heldItem: HoldItemId | null
  moves: string[]
  nature: string
}

export type Bag = Record<string, number>

export interface Trainer {
  level: number
  xp: number
  look: string
  facing: Dir
}

export type Outcome = 'won' | 'caught' | 'fled' | 'lost'

export interface Hit {
  by: 'player' | 'wild'
  type: string
  factor: number
}

export interface Battle {
  wild: Mon
  activeUid: string
  mustSwitch: boolean
  outcome: Outcome | null
  log: string[]
  hits: Hit[]
  lastChance: boolean
}

export interface GameState {
  place: Place
  pos: Pos
  team: Mon[]
  pc: Mon[]
  bag: Bag
  money: number
  region: RegionId
  hunt: number | null
  biome: PokemonType | null
  trainer: Trainer
  battle: Battle | null
}

export type BattleAction =
  | { kind: 'fight'; move: number }
  | { kind: 'item'; item: string; target?: string }
  | { kind: 'switch'; uid: string }
  | { kind: 'run' }

export interface Refusal {
  error: string
}

export type Step = GameState | Refusal

export const TEAM_LIMIT = 5
export const MOVE_SLOTS = 4
export const STARTERS = [1, 4, 7]
export const STARTER_LEVEL = 5
export const STONE_DROP_CHANCE = 0.01
export const CAUGHT_MAX_LEVEL = 20
export const EVOLUTION_LEVEL_STEP = 100
export const MONEY_PER_LEVEL = { won: 20, caught: 10 }
export const XP_PER_WILD_LEVEL = 10
export const XP_PER_LEVEL = 10
export const BUY_MAX = 99
export const STARTING_MONEY = 1000

const STARTING_BAG: Bag = { pokeball: 10, potion: 5 }
const BASE_CATCH = 0.6
const SAME_TYPE_BONUS = 1.5
const TYPE_BOOST = 1.2
const CHOICE_BAND_BOOST = 1.5
const LUCKY_EGG_BOOST = 1.5
const QUICK_CLAW_CHANCE = 0.2
const LEFTOVERS_SHARE = 16
const FAILED_FLEE_CHANCE = 0.5

export const refuse = (error: string): Refusal => ({ error })
export const isRefusal = (step: Step): step is Refusal => 'error' in step

const scaled = (base: number, level: number) => Math.floor((2 * base * level) / 100)

export const maxHp = (mon: Mon) => scaled(mon.species.stats.hp, mon.level) + mon.level + 10
const stat = (mon: Mon, key: NatureStat) => Math.floor((scaled(mon.species.stats[key], mon.level) + 5) * natureFactor(mon.nature, key))
export const statTotal = (stats: BaseStats) => stats.hp + stats.attack + stats.defense + stats.spAttack + stats.spDefense + stats.speed
export const isFainted = (mon: Mon) => mon.hp <= 0
export const xpToNext = (level: number) => level * XP_PER_LEVEL
export const evolutionLevel = (stage: number) => (stage + 1) * EVOLUTION_LEVEL_STEP

export const displayName = (mon: Mon) => mon.species.name.charAt(0).toUpperCase() + mon.species.name.slice(1)

export const availableMoves = (mon: Pick<Mon, 'species' | 'level'>) => mon.species.moves.filter((m) => m.level <= mon.level)

function fillMoves(mon: Mon): Mon {
  const free = MOVE_SLOTS - mon.moves.length
  if (free <= 0) return mon
  const extra = availableMoves(mon).filter((m) => !mon.moves.includes(m.name)).map((m) => m.name).slice(-free)
  return extra.length ? { ...mon, moves: [...mon.moves, ...extra] } : mon
}

export function movesOf(mon: Mon): Move[] {
  const chosen = mon.moves.map((name) => mon.species.moves.find((m) => m.name === name)).filter((m): m is Move => !!m)
  return chosen.length ? chosen : mon.species.moves.slice(0, 1)
}

export function createMon(species: Species, level: number, uid: string, nature = NEUTRAL_NATURE): Mon {
  const mon = fillMoves({ uid, species, level, xp: 0, hp: 0, heldItem: null, moves: [], nature })
  return { ...mon, hp: maxHp(mon) }
}

export function gainXp<T extends { level: number; xp: number }>(holder: T, amount: number): T {
  let { level, xp } = holder
  xp += amount
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level)
    level += 1
  }
  return { ...holder, level, xp }
}

export function damage(attacker: Mon, defender: Mon, move: Move, roll: number): number {
  const typeFactor = effectiveness(move.type, defender.species.types)
  if (typeFactor === 0) return 0
  const [atk, def] = move.category === 'special' ? (['spAttack', 'spDefense'] as const) : (['attack', 'defense'] as const)
  const base = Math.floor(((Math.floor((2 * attacker.level) / 5) + 2) * move.power * stat(attacker, atk)) / stat(defender, def) / 50) + 2
  const sameType = attacker.species.types.includes(move.type) ? SAME_TYPE_BONUS : 1
  const held = attacker.heldItem
  const booster = held && TYPE_BOOSTERS[held] === move.type ? TYPE_BOOST : 1
  const band = held === 'choice-band' ? CHOICE_BAND_BOOST : 1
  return Math.max(1, Math.floor(base * sameType * booster * band * typeFactor * roll))
}

export function catchChance(mon: Mon, ball: BallId): number {
  const max = maxHp(mon)
  return Math.min(1, ((3 * max - 2 * mon.hp) / (3 * max)) * BASE_CATCH * BALLS[ball].rate)
}

export function newGame(starter: Mon, look: string): GameState {
  return {
    place: 'outdoor',
    pos: START,
    team: [starter],
    pc: [],
    bag: { ...STARTING_BAG },
    money: STARTING_MONEY,
    region: DEFAULT_REGION,
    hunt: null,
    biome: null,
    trainer: { level: 1, xp: 0, look, facing: 'down' },
    battle: null
  }
}

function migrateMon(mon: Mon): Mon {
  const { stats } = mon.species
  const species = {
    ...mon.species,
    stats: { ...stats, spAttack: stats.spAttack ?? stats.attack, spDefense: stats.spDefense ?? stats.defense },
    moves: mon.species.moves.map((m) => ({ ...m, level: m.level ?? 1, category: m.category ?? 'physical' }))
  }
  return fillMoves({ ...mon, species, moves: mon.moves ?? [], nature: mon.nature ?? NEUTRAL_NATURE })
}

export function refreshSpecies(game: GameState, species: Map<number, Species>): GameState {
  const fresh = (mon: Mon): Mon => {
    const current = species.get(mon.species.id)
    return current ? fillMoves({ ...mon, species: current }) : mon
  }
  return { ...game, team: game.team.map(fresh), pc: game.pc.map(fresh), battle: game.battle && { ...game.battle, wild: fresh(game.battle.wild) } }
}

export function withDefaults(game: GameState): GameState {
  const battle = game.battle && { ...game.battle, wild: migrateMon(game.battle.wild), hits: game.battle.hits ?? [], lastChance: game.battle.lastChance ?? false }
  return { ...game, team: game.team.map(migrateMon), pc: game.pc.map(migrateMon), battle, hunt: game.hunt ?? null, biome: game.biome ?? null, place: game.place ?? 'outdoor', trainer: { ...game.trainer, look: game.trainer.look ?? DEFAULT_LOOK, facing: game.trainer.facing ?? 'down' } }
}

export const leadMon = (game: GameState) => game.team.find((m) => !isFainted(m)) ?? game.team[0]


export function startBattle(game: GameState, wild: Mon): GameState {
  return {
    ...game,
    battle: { wild, activeUid: leadMon(game).uid, mustSwitch: false, outcome: null, log: [`Um ${displayName(wild)} selvagem apareceu!`], hits: [], lastChance: false }
  }
}

export function endBattle(game: GameState): Step {
  if (!game.battle?.outcome) return refuse('A batalha ainda não acabou')
  return { ...game, battle: null }
}

const outsideBattle = (game: GameState): Refusal | null => (game.battle ? refuse('Termine a batalha primeiro') : null)

export function healTeam(game: GameState): GameState {
  return { ...game, team: game.team.map((m) => ({ ...m, hp: maxHp(m) })) }
}

export function depositMon(game: GameState, uid: string): Step {
  const blocked = outsideBattle(game)
  if (blocked) return blocked
  const mon = game.team.find((m) => m.uid === uid)
  if (!mon) return refuse('Pokémon não está na equipe')
  if (game.team.length <= 1) return refuse('A equipe precisa de pelo menos 1 pokémon')
  return { ...game, team: game.team.filter((m) => m.uid !== uid), pc: [...game.pc, mon] }
}

export function withdrawMon(game: GameState, uid: string): Step {
  const blocked = outsideBattle(game)
  if (blocked) return blocked
  const mon = game.pc.find((m) => m.uid === uid)
  if (!mon) return refuse('Pokémon não está no computador')
  if (game.team.length >= TEAM_LIMIT) return refuse(`A equipe já tem ${TEAM_LIMIT} pokémon`)
  return { ...game, pc: game.pc.filter((m) => m.uid !== uid), team: [...game.team, mon] }
}

export const evolutionStone = (mon: Mon) => stoneId(mon.species.types[0])

export function canEvolve(mon: Mon, bag: Bag): boolean {
  const evolution = mon.species.evolution
  return !!evolution && mon.level >= evolution.level && (bag[evolutionStone(mon)] ?? 0) > 0
}

const findMon = (game: GameState, uid: string) => [...game.team, ...game.pc].find((m) => m.uid === uid)

const replaceEverywhere = (game: GameState, mon: Mon): GameState => {
  const swap = (list: Mon[]) => list.map((m) => (m.uid === mon.uid ? mon : m))
  return { ...game, team: swap(game.team), pc: swap(game.pc) }
}

const spend = (bag: Bag, item: string, amount = 1): Bag => {
  const left = (bag[item] ?? 0) - amount
  const next = { ...bag, [item]: left }
  if (left <= 0) delete next[item]
  return next
}

export const addItem = (bag: Bag, item: string, amount = 1): Bag => ({ ...bag, [item]: (bag[item] ?? 0) + amount })

export function evolveTarget(game: GameState, uid: string): Evolution | Refusal {
  const blocked = outsideBattle(game)
  if (blocked) return blocked
  const mon = findMon(game, uid)
  if (!mon) return refuse('Pokémon não encontrado')
  const evolution = mon.species.evolution
  if (!evolution) return refuse(`${displayName(mon)} não evolui`)
  if (mon.level < evolution.level) return refuse(`${displayName(mon)} evolui no nível ${evolution.level}`)
  if (!canEvolve(mon, game.bag)) return refuse(`Precisa de uma ${itemLabel(evolutionStone(mon))}`)
  return evolution
}

export function evolveMon(game: GameState, uid: string, next: Species): Step {
  const target = evolveTarget(game, uid)
  if ('error' in target) return target
  const mon = findMon(game, uid)!
  const grown = fillMoves({ ...mon, species: next, moves: mon.moves.filter((name) => next.moves.some((m) => m.name === name && m.level <= mon.level)) })
  const evolved = { ...grown, hp: Math.max(1, maxHp(grown) - (maxHp(mon) - mon.hp)) }
  return { ...replaceEverywhere(game, evolved), bag: spend(game.bag, evolutionStone(mon)) }
}

export function setMoves(game: GameState, uid: string, names: string[]): Step {
  const blocked = outsideBattle(game)
  if (blocked) return blocked
  const mon = findMon(game, uid)
  if (!mon) return refuse('Pokémon não encontrado')
  if (names.length < 1 || names.length > MOVE_SLOTS) return refuse(`Escolha de 1 a ${MOVE_SLOTS} golpes`)
  if (new Set(names).size !== names.length) return refuse('Golpe repetido')
  const learned = new Set(availableMoves(mon).map((m) => m.name))
  const unknown = names.find((name) => !learned.has(name))
  if (unknown) return refuse(`${unknown} ainda não foi aprendido`)
  return replaceEverywhere(game, { ...mon, moves: names })
}

export function buyItem(game: GameState, item: string, quantity: number): Step {
  const price = itemPrice(item)
  if (price === null) return refuse('Esse item não está à venda')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > BUY_MAX) return refuse(`Compre de 1 a ${BUY_MAX}`)
  const total = price * quantity
  if (game.money < total) return refuse('Dinheiro insuficiente')
  return { ...game, money: game.money - total, bag: addItem(game.bag, item, quantity) }
}

export function holdItem(game: GameState, uid: string, item: string | null): Step {
  const blocked = outsideBattle(game)
  if (blocked) return blocked
  const mon = findMon(game, uid)
  if (!mon) return refuse('Pokémon não encontrado')
  if (item !== null && !isHoldItem(item)) return refuse('Esse item não pode ser segurado')
  if (item !== null && (game.bag[item] ?? 0) <= 0) return refuse('Você não tem esse item')
  let bag = mon.heldItem ? addItem(game.bag, mon.heldItem) : game.bag
  if (item) bag = spend(bag, item)
  return { ...replaceEverywhere(game, { ...mon, heldItem: item }), bag }
}

type Rng = () => number

interface Turn {
  game: GameState
  battle: Battle
}

const roll = (rng: Rng) => 0.85 + 0.15 * rng()
const activeOf = ({ game, battle }: Turn) => game.team.find((m) => m.uid === battle.activeUid)!
const say = (turn: Turn, line: string): Turn => ({ ...turn, battle: { ...turn.battle, log: [...turn.battle.log, line] } })
const withBattle = (turn: Turn, patch: Partial<Battle>): Turn => ({ ...turn, battle: { ...turn.battle, ...patch } })
const withGame = (turn: Turn, patch: Partial<GameState>): Turn => ({ ...turn, game: { ...turn.game, ...patch } })
const replaceMon = (turn: Turn, mon: Mon): Turn => withGame(turn, { team: turn.game.team.map((m) => (m.uid === mon.uid ? mon : m)) })

export function battleTurn(game: GameState, action: BattleAction, rng: Rng): Step {
  const battle = game.battle
  if (!battle) return refuse('Nenhuma batalha em andamento')
  if (battle.outcome) return lastChanceThrow({ game, battle: { ...battle, hits: [] } }, action, rng)
  if (battle.mustSwitch && action.kind !== 'switch') return refuse('Escolha outro pokémon')
  const turn = resolve({ game, battle: { ...battle, hits: [] } }, action, rng)
  if ('error' in turn) return turn
  const ended = endOfTurn(turn)
  return { ...ended.game, battle: ended.battle }
}

function resolve(turn: Turn, action: BattleAction, rng: Rng): Turn | Refusal {
  switch (action.kind) {
    case 'fight':
      return fight(turn, action.move, rng)
    case 'item':
      return useItem(turn, action.item, action.target, rng)
    case 'switch':
      return switchTo(turn, action.uid, rng)
    case 'run':
      return run(turn, rng)
  }
}

function endOfTurn(turn: Turn): Turn {
  if (turn.battle.outcome || turn.battle.mustSwitch) return turn
  const me = activeOf(turn)
  const max = maxHp(me)
  if (me.heldItem !== 'leftovers' || isFainted(me) || me.hp >= max) return turn
  const healed = { ...me, hp: Math.min(max, me.hp + Math.max(1, Math.floor(max / LEFTOVERS_SHARE))) }
  return say(replaceMon(turn, healed), `${displayName(me)} recuperou HP com Leftovers.`)
}

function fight(turn: Turn, moveIndex: number, rng: Rng): Turn | Refusal {
  const me = activeOf(turn)
  const move = movesOf(me)[moveIndex]
  if (!move) return refuse('Golpe inválido')
  const clawed = me.heldItem === 'quick-claw' && rng() < QUICK_CLAW_CHANCE
  const playerFirst = clawed || stat(me, 'speed') >= stat(turn.battle.wild, 'speed')
  const start = clawed ? say(turn, `A Quick Claw deixou ${displayName(me)} atacar primeiro!`) : turn
  if (playerFirst) return playerAttack(start, move, rng, true)
  const hit = wildAttack(start, rng)
  if (hit.battle.mustSwitch || hit.battle.outcome) return hit
  return playerAttack(hit, move, rng, false)
}

const hitOf = (by: Hit['by'], move: Move, target: Mon): Hit => ({ by, type: move.type, factor: effectiveness(move.type, target.species.types) })

function sayEffect(turn: Turn, move: Move, target: Mon): Turn {
  const factor = effectiveness(move.type, target.species.types)
  if (factor === 0) return say(turn, `Não afeta ${displayName(target)}...`)
  if (factor > 1) return say(turn, 'É super efetivo!')
  if (factor < 1) return say(turn, 'Não é muito efetivo...')
  return turn
}

function playerAttack(turn: Turn, move: Move, rng: Rng, wildReplies: boolean): Turn {
  const me = activeOf(turn)
  const wild = turn.battle.wild
  const hp = Math.max(0, wild.hp - damage(me, wild, move, roll(rng)))
  const struck = withBattle(turn, { wild: { ...wild, hp }, hits: [...turn.battle.hits, hitOf('player', move, wild)] })
  const hit = sayEffect(say(struck, `${displayName(me)} usou ${move.name}!`), move, wild)
  if (hp > 0) return wildReplies ? wildAttack(hit, rng) : hit
  return win(say(hit, `${displayName(wild)} selvagem desmaiou!`), rng)
}

function earn(turn: Turn, kind: keyof typeof MONEY_PER_LEVEL): Turn {
  const amount = turn.battle.wild.level * MONEY_PER_LEVEL[kind]
  return say(withGame(turn, { money: turn.game.money + amount }), `Você ganhou ₽${amount}.`)
}

const newlyLearned = (before: Mon, after: Mon) => availableMoves(after).filter((m) => m.level > before.level && !before.moves.includes(m.name))

function grantXp(turn: Turn): Turn {
  const me = activeOf(turn)
  const egg = me.heldItem === 'lucky-egg' ? LUCKY_EGG_BOOST : 1
  const amount = Math.floor(turn.battle.wild.level * XP_PER_WILD_LEVEL * egg)
  const grown = fillMoves(gainXp(me, amount))
  const leveled = { ...grown, hp: me.hp + maxHp(grown) - maxHp(me) }
  const trainer = gainXp(turn.game.trainer, amount)
  let next = say(withGame(replaceMon(turn, leveled), { trainer }), `${displayName(me)} ganhou ${amount} XP.`)
  if (leveled.level > me.level) next = say(next, `${displayName(me)} subiu para o nível ${leveled.level}!`)
  for (const move of newlyLearned(me, leveled)) next = say(next, leveled.moves.includes(move.name) ? `${displayName(me)} aprendeu ${move.name}!` : `${displayName(me)} aprendeu ${move.name}! Troque no Computador.`)
  if (trainer.level > turn.game.trainer.level) next = say(next, `Você subiu para o nível ${trainer.level} de treinador!`)
  return next
}

function dropStone(turn: Turn, rng: Rng): Turn {
  if (rng() >= STONE_DROP_CHANCE) return turn
  const stone = evolutionStone(turn.battle.wild)
  return say(withGame(turn, { bag: addItem(turn.game.bag, stone) }), `Você encontrou uma ${itemLabel(stone)}!`)
}

function win(turn: Turn, rng: Rng): Turn {
  return withBattle(dropStone(earn(grantXp(turn), 'won'), rng), { outcome: 'won', lastChance: true })
}

function wildAttack(turn: Turn, rng: Rng): Turn {
  const wild = turn.battle.wild
  const wildMoves = movesOf(wild)
  const move = wildMoves[Math.floor(rng() * wildMoves.length)]
  const me = activeOf(turn)
  const hp = Math.max(0, me.hp - damage(wild, me, move, roll(rng)))
  const struck = withBattle(replaceMon(turn, { ...me, hp }), { hits: [...turn.battle.hits, hitOf('wild', move, me)] })
  const hit = sayEffect(say(struck, `${displayName(wild)} selvagem usou ${move.name}!`), move, me)
  if (hp > 0) return hit
  const fainted = say(hit, `${displayName(me)} desmaiou!`)
  if (fainted.game.team.some((m) => !isFainted(m))) return withBattle(fainted, { mustSwitch: true })
  return lose(fainted)
}

function lose(turn: Turn): Turn {
  const team = turn.game.team.map((m) => ({ ...m, hp: maxHp(m) }))
  return withBattle(say(withGame(turn, { team, place: 'center', pos: CENTER_SPAWN }), 'Sua equipe desmaiou. Você voltou para o Centro Pokémon.'), { outcome: 'lost' })
}

function useItem(turn: Turn, item: string, target: string | undefined, rng: Rng): Turn | Refusal {
  if ((turn.game.bag[item] ?? 0) <= 0) return refuse('Você não tem esse item')
  const category = itemCategory(item)
  if (category === 'ball') return throwBall(withGame(turn, { bag: spend(turn.game.bag, item) }), item as BallId, rng)
  if (category === 'revive') return revive(turn, item as ReviveId, target, rng)
  if (category !== 'potion') return refuse('Esse item não pode ser usado na batalha')
  const me = activeOf(turn)
  if (me.hp >= maxHp(me)) return refuse(`${displayName(me)} já está com o HP cheio`)
  return drinkPotion(withGame(turn, { bag: spend(turn.game.bag, item) }), item as PotionId, rng)
}

function throwBall(turn: Turn, ball: BallId, rng: Rng): Turn {
  const wild = turn.battle.wild
  const thrown = say(turn, `Você jogou uma ${BALLS[ball].label}!`)
  if (rng() >= catchChance(wild, ball)) return wildAttack(say(thrown, `${displayName(wild)} escapou!`), rng)
  return capture(thrown)
}

function tamed(wild: Mon): Mon {
  const level = Math.min(wild.level, CAUGHT_MAX_LEVEL)
  if (level === wild.level) return { ...wild, hp: Math.max(1, wild.hp) }
  const sized = { ...wild, level, xp: 0 }
  const learned = new Set(availableMoves(sized).map((m) => m.name))
  const kept = fillMoves({ ...sized, moves: wild.moves.filter((name) => learned.has(name)) })
  return { ...kept, hp: Math.max(1, Math.round((wild.hp / maxHp(wild)) * maxHp(kept))) }
}

function capture(thrown: Turn): Turn {
  const wild = tamed(thrown.battle.wild)
  const toTeam = thrown.game.team.length < TEAM_LIMIT
  const placed = toTeam ? withGame(thrown, { team: [...thrown.game.team, wild] }) : withGame(thrown, { pc: [...thrown.game.pc, wild] })
  const where = toTeam ? 'entrou na equipe' : 'foi para o computador'
  return withBattle(earn(say(placed, `Você capturou ${displayName(wild)}! Ele ${where}.`), 'caught'), { outcome: 'caught', lastChance: false })
}

function lastChanceThrow(turn: Turn, action: BattleAction, rng: Rng): Step {
  const ended = refuse('A batalha já acabou')
  if (!turn.battle.lastChance || turn.battle.outcome !== 'won' || action.kind !== 'item' || itemCategory(action.item) !== 'ball') return ended
  if ((turn.game.bag[action.item] ?? 0) <= 0) return refuse('Você não tem esse item')
  const ball = action.item as BallId
  const wild = turn.battle.wild
  const thrown = say(withBattle(withGame(turn, { bag: spend(turn.game.bag, ball) }), { lastChance: false }), `Você jogou uma ${BALLS[ball].label}!`)
  const next = rng() < catchChance(wild, ball) ? capture(thrown) : say(thrown, `${displayName(wild)} escapou! A batalha acabou.`)
  return { ...next.game, battle: next.battle }
}

function drinkPotion(turn: Turn, potion: PotionId, rng: Rng): Turn {
  const me = activeOf(turn)
  const heal = Math.max(1, Math.floor(maxHp(me) * POTIONS[potion].share))
  const healed = { ...me, hp: Math.min(maxHp(me), me.hp + heal) }
  return wildAttack(say(replaceMon(turn, healed), `Você usou ${POTIONS[potion].label} em ${displayName(me)}.`), rng)
}

function revive(turn: Turn, item: ReviveId, target: string | undefined, rng: Rng): Turn | Refusal {
  const down = turn.game.team.find((m) => m.uid === target)
  if (!down || !isFainted(down)) return refuse('Escolha um pokémon desmaiado')
  const back = { ...down, hp: Math.max(1, Math.floor(maxHp(down) * REVIVES[item].share)) }
  const used = withGame(turn, { bag: spend(turn.game.bag, item) })
  return wildAttack(say(replaceMon(used, back), `Você usou ${REVIVES[item].label} em ${displayName(down)}.`), rng)
}

function switchTo(turn: Turn, uid: string, rng: Rng): Turn | Refusal {
  const next = turn.game.team.find((m) => m.uid === uid)
  if (!next) return refuse('Pokémon não está na equipe')
  if (isFainted(next)) return refuse(`${displayName(next)} está desmaiado`)
  if (uid === turn.battle.activeUid) return refuse(`${displayName(next)} já está lutando`)
  const forced = turn.battle.mustSwitch
  const swapped = say(withBattle(turn, { activeUid: uid, mustSwitch: false }), `Vai, ${displayName(next)}!`)
  return forced ? swapped : wildAttack(swapped, rng)
}

function run(turn: Turn, rng: Rng): Turn {
  const faster = stat(activeOf(turn), 'speed') >= stat(turn.battle.wild, 'speed')
  if (faster || rng() < FAILED_FLEE_CHANCE) return withBattle(say(turn, 'Você fugiu!'), { outcome: 'fled' })
  return wildAttack(say(turn, 'Não deu para fugir!'), rng)
}

