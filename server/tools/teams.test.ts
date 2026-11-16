// Sorteador de times (A8): validação e sorteio, com um gerador previsível.
import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LANES, type Lane, type TeamPlayer } from '../../src/shared/types'
import { drawTeams, shuffle, validateTeams, type CleanTeamsInput, type Rand } from './teams'

/** Gerador com semente (mulberry32): o mesmo sorteio toda vez. */
function seeded(seed: number): Rand {
  let a = seed >>> 0
  return (max) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max)
  }
}

const people = (n: number, lanes?: (i: number) => Lane[]): TeamPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ name: `Pessoa ${i + 1}`, ...(lanes ? { lanes: lanes(i) } : {}) }))

function valid(req: unknown): CleanTeamsInput {
  const input = validateTeams(req)
  if (typeof input === 'string') throw new Error(input)
  return input
}

describe('validateTeams', () => {
  it('recusa entradas inválidas com mensagens claras', () => {
    expect(validateTeams(null)).toBe('Lista de pessoas inválida')
    expect(validateTeams({ players: 'Ana' })).toBe('Lista de pessoas inválida')
    expect(validateTeams({ players: people(1), teamCount: 2 })).toBe('Coloque pelo menos 2 pessoas')
    expect(validateTeams({ players: people(51), teamCount: 2 })).toBe('No máximo 50 pessoas')
    expect(validateTeams({ players: [{ name: '  ' }, { name: 'B' }], teamCount: 2 })).toBe('Cada nome precisa ter de 1 a 32 caracteres')
    expect(validateTeams({ players: [{ name: 'a'.repeat(33) }, { name: 'B' }], teamCount: 2 })).toBe('Cada nome precisa ter de 1 a 32 caracteres')
    expect(validateTeams({ players: [{ name: 'Ana' }, { name: ' ana ' }], teamCount: 2 })).toBe('Nome repetido: ana')
    expect(validateTeams({ players: [{ name: 'Ana', lanes: ['meio'] }, { name: 'B' }], teamCount: 2 })).toBe('Lanes inválidas para Ana')
    expect(validateTeams({ players: [{ name: 'Ana', lanes: ['mid', 'mid'] }, { name: 'B' }], teamCount: 2 })).toBe('Lanes inválidas para Ana')
    expect(validateTeams({ players: people(4), teamCount: 1 })).toBe('O número de times vai de 2 a 10')
    expect(validateTeams({ players: people(30), teamCount: 11 })).toBe('O número de times vai de 2 a 10')
    expect(validateTeams({ players: people(4), teamCount: 2.5 })).toBe('O número de times vai de 2 a 10')
    expect(validateTeams({ players: people(3), teamCount: 4 })).toBe('Mais times do que pessoas')
    expect(validateTeams({ players: people(11), teamCount: 2, lanes: true })).toBe(
      'Com 5 lanes, cada time pode ter no máximo 5 pessoas: aumente o número de times ou as lanes'
    )
  })

  it('limpa os nomes e ignora preferências quando as lanes estão desligadas', () => {
    expect(valid({ players: [{ name: '  Ana   Maria ', lanes: ['mid'] }, { name: 'Bia' }], teamCount: 2 })).toEqual({
      players: [
        { name: 'Ana Maria', lanes: [] },
        { name: 'Bia', lanes: [] }
      ],
      teamCount: 2,
      lanes: false,
      laneSet: [...LANES]
    })
    expect(valid({ players: [{ name: 'Ana', lanes: ['mid'] }, { name: 'Bia' }], teamCount: 2, lanes: true }).players[0].lanes).toEqual(['mid'])
  })
})

describe('shuffle', () => {
  it('é uma permutação e não mexe na lista original', () => {
    const list = [1, 2, 3, 4, 5, 6, 7]
    const out = shuffle(list, seeded(1))
    expect([...out].sort()).toEqual(list)
    expect(list).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('cada posição recebe cada item com a mesma chance (Fisher–Yates sem viés)', () => {
    const counts = [0, 0, 0]
    const rand = seeded(42)
    for (let i = 0; i < 30_000; i++) counts[shuffle(['a', 'b', 'c'], rand).indexOf('a')]++
    for (const c of counts) expect(c).toBeGreaterThan(9_400) // ~10 000 cada
  })
})

describe('drawTeams', () => {
  it('todo mundo entra exatamente uma vez e os times diferem em no máximo 1 (número ímpar)', () => {
    for (const [n, teams] of [
      [7, 2],
      [10, 3],
      [50, 10],
      [2, 2]
    ]) {
      const result = drawTeams(valid({ players: people(n), teamCount: teams }), seeded(n))
      expect(result.teams).toHaveLength(teams)
      const names = result.teams.flatMap((t) => t.members.map((m) => m.name))
      expect(names.sort()).toEqual(people(n).map((p) => p.name).sort())
      const sizes = result.teams.map((t) => t.members.length)
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
      expect(result.lanes).toBe(false)
      expect(result.teams.flatMap((t) => t.members).every((m) => m.lane === undefined)).toBe(true)
    }
  })

  it('o time com uma pessoa a mais também é sorteado', () => {
    const rand = seeded(7)
    const firstIsBigger = Array.from({ length: 200 }, () => drawTeams(valid({ players: people(5), teamCount: 2 }), rand).teams[0].members.length === 3)
    expect(firstIsBigger.filter(Boolean).length).toBeGreaterThan(60)
    expect(firstIsBigger.filter((x) => !x).length).toBeGreaterThan(60)
  })

  it('com lanes: ninguém repete lane no time e os membros vêm na ordem das lanes', () => {
    const result = drawTeams(valid({ players: people(10), teamCount: 2, lanes: true }), seeded(3))
    for (const team of result.teams) {
      const lanes = team.members.map((m) => m.lane)
      expect(lanes).toEqual([...LANES])
    }
    // times menores que 5: lanes diferentes, sem buracos de ordem
    const small = drawTeams(valid({ players: people(7), teamCount: 2, lanes: true }), seeded(4))
    for (const team of small.teams) {
      const lanes = team.members.map((m) => m.lane!)
      expect(new Set(lanes).size).toBe(lanes.length)
      expect([...lanes].sort((a, b) => LANES.indexOf(a) - LANES.indexOf(b))).toEqual(lanes)
    }
  })

  it('preferências: cada um com uma preferida diferente recebe a sua', () => {
    const players = LANES.map((lane, i) => ({ name: `P${i}`, lanes: [lane] }))
    for (let seed = 0; seed < 20; seed++) {
      const result = drawTeams(valid({ players, teamCount: 2, lanes: true }), seeded(seed))
      for (const m of result.teams.flatMap((t) => t.members)) expect(m.lane).toBe(players.find((p) => p.name === m.name)!.lanes[0])
    }
  })

  it('preferências: dois que só jogam de meio ficam em times diferentes (o sorteio é repetido)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const players = people(10, (i) => (i < 2 ? ['mid'] : []))
      const result = drawTeams(valid({ players, teamCount: 2, lanes: true }), seeded(seed))
      const mids = result.teams.map((t) => t.members.find((m) => m.lane === 'mid')!.name)
      expect(mids.sort()).toEqual(['Pessoa 1', 'Pessoa 2'])
    }
  })

  it('a validação guarda as preferências na ordem da pessoa, sem as lanes fora das disponíveis', () => {
    const input = valid({ players: [{ name: 'Ana', lanes: ['support', 'jungle', 'top'] }, { name: 'Bia' }], teamCount: 2, lanes: true, laneSet: ['top', 'support'] })
    expect(input.players[0].lanes).toEqual(['support', 'top'])
  })

  it('quando a 1ª preferência já é de outro no time, a pessoa fica com a 2ª', () => {
    const players: TeamPlayer[] = [
      { name: 'Ana', lanes: ['mid', 'top'] },
      { name: 'Bia', lanes: ['mid', 'jungle'] },
      { name: 'Caio', lanes: ['mid', 'adc'] },
      { name: 'Duda', lanes: ['mid', 'support'] }
    ]
    for (let seed = 0; seed < 20; seed++) {
      const result = drawTeams(valid({ players, teamCount: 2, lanes: true }), seeded(seed))
      for (const team of result.teams) {
        expect(team.members.filter((m) => m.lane === 'mid')).toHaveLength(1)
        for (const m of team.members) expect(players.find((p) => p.name === m.name)!.lanes).toContain(m.lane)
      }
    }
  })

  it('a 1ª preferência vale mais que a 2ª', () => {
    const players: TeamPlayer[] = [
      { name: 'Ana', lanes: ['top', 'mid'] },
      { name: 'Bia', lanes: ['mid'] }
    ]
    for (let seed = 0; seed < 10; seed++) {
      const [team] = drawTeams(valid({ players: [...players, { name: 'X' }, { name: 'Y' }], teamCount: 2, lanes: true }), seeded(seed)).teams.filter(
        (t) => t.members.some((m) => m.name === 'Ana') && t.members.some((m) => m.name === 'Bia')
      )
      if (!team) continue // caíram em times diferentes: cada uma com a sua 1ª
      expect(team.members.find((m) => m.name === 'Ana')!.lane).toBe('top')
      expect(team.members.find((m) => m.name === 'Bia')!.lane).toBe('mid')
    }
  })

  it('funciona com o acaso de verdade (crypto.randomInt)', () => {
    const result = drawTeams(valid({ players: people(10, (i) => [LANES[i % 5]]), teamCount: 2, lanes: true }), randomInt)
    expect(result.teams.flatMap((t) => t.members)).toHaveLength(10)
  })
})

describe('conta de cada pessoa (para mover os times)', () => {
  it('leva o accountId do pedido para o resultado, com e sem lanes', () => {
    const players = [{ name: 'Ana', accountId: 'acc-ana' }, { name: 'Bia' }, { name: 'Caio', accountId: 'acc-caio' }, { name: 'Duda' }]
    for (const lanes of [false, true]) {
      const members = drawTeams(valid({ players, teamCount: 2, lanes }), seeded(3)).teams.flatMap((t) => t.members)
      expect(members.find((m) => m.name === 'Ana')?.accountId).toBe('acc-ana')
      expect(members.find((m) => m.name === 'Caio')?.accountId).toBe('acc-caio')
      expect(members.find((m) => m.name === 'Bia')).not.toHaveProperty('accountId')
    }
  })

  it('recusa conta inválida ou repetida', () => {
    const base = { name: 'Bia' }
    expect(validateTeams({ players: [{ name: 'Ana', accountId: 5 }, base], teamCount: 2 })).toBe('Conta inválida para Ana')
    expect(validateTeams({ players: [{ name: 'Ana', accountId: '' }, base], teamCount: 2 })).toBe('Conta inválida para Ana')
    expect(validateTeams({ players: [{ name: 'Ana', accountId: 'x'.repeat(65) }, base], teamCount: 2 })).toBe('Conta inválida para Ana')
    expect(
      validateTeams({ players: [{ name: 'Ana', accountId: 'a' }, { name: 'Outra', accountId: 'a' }], teamCount: 2 })
    ).toBe('Pessoa repetida: Outra')
  })
})

describe('lanes disponíveis (laneSet)', () => {
  it('só sorteia as lanes escolhidas, na ordem de LANES, e o resultado diz quais valeram', () => {
    const input = valid({ players: people(6), teamCount: 2, lanes: true, laneSet: ['adc', 'top', 'mid'] })
    expect(input.laneSet).toEqual(['top', 'mid', 'adc'])
    const result = drawTeams(input, seeded(5))
    expect(result.laneSet).toEqual(['top', 'mid', 'adc'])
    for (const team of result.teams) expect(team.members.map((m) => m.lane)).toEqual(['top', 'mid', 'adc'])
  })

  it('times menores que as lanes: lanes diferentes, todas da lista', () => {
    const result = drawTeams(valid({ players: people(4), teamCount: 2, lanes: true, laneSet: ['top', 'jungle', 'mid'] }), seeded(9))
    for (const team of result.teams) {
      const lanes = team.members.map((m) => m.lane)
      expect(new Set(lanes).size).toBe(2)
      expect(lanes.every((l) => ['top', 'jungle', 'mid'].includes(l as string))).toBe(true)
    }
  })

  it('o tamanho máximo do time é o número de lanes', () => {
    expect(validateTeams({ players: people(7), teamCount: 2, lanes: true, laneSet: ['top', 'mid', 'adc'] })).toBe(
      'Com 3 lanes, cada time pode ter no máximo 3 pessoas: aumente o número de times ou as lanes'
    )
    expect(validateTeams({ players: people(3), teamCount: 2, lanes: true, laneSet: ['mid'] })).toBe(
      'Com 1 lane, cada time pode ter no máximo 1 pessoa: aumente o número de times ou as lanes'
    )
  })

  it('recusa lista vazia, lane desconhecida ou repetida; sem lanes, a lista é ignorada', () => {
    const base = { players: people(2), teamCount: 2, lanes: true }
    expect(validateTeams({ ...base, laneSet: [] })).toBe('Escolha pelo menos uma lane')
    expect(validateTeams({ ...base, laneSet: ['top', 'baron'] })).toBe('Lanes disponíveis inválidas')
    expect(validateTeams({ ...base, laneSet: ['top', 'top'] })).toBe('Lanes disponíveis inválidas')
    expect(validateTeams({ ...base, laneSet: 'top' })).toBe('Lanes disponíveis inválidas')
    expect(valid({ players: people(2), teamCount: 2, laneSet: 'lixo' }).laneSet).toEqual([...LANES])
  })

  it('preferência por lane fora da lista é ignorada; todas as lanes não vão no resultado', () => {
    const input = valid({ players: [{ name: 'Ana', lanes: ['support', 'mid'] }, { name: 'Bia' }], teamCount: 2, lanes: true, laneSet: ['top', 'mid'] })
    expect(input.players[0].lanes).toEqual(['mid'])
    expect(drawTeams(valid({ players: people(2), teamCount: 2, lanes: true }), seeded(1))).not.toHaveProperty('laneSet')
  })
})
