// Mover os times para salas de voz (v4): formato do pedido e "quem é quem" entre quem está na voz.
import { describe, expect, it } from 'vitest'
import type { Team } from '../../src/shared/types'
import { planMoves, validateMoveRequest, type VoicePerson } from './move'

const person = (socketId: string, accountId: string, name: string, tag = accountId, channelId = 'lobby'): VoicePerson => ({
  socketId,
  accountId,
  name,
  tag,
  channelId
})

describe('validateMoveRequest', () => {
  it('recusa formatos inválidos', () => {
    expect(validateMoveRequest(null)).toBe('Pedido inválido')
    expect(validateMoveRequest({ messageId: 'm' })).toBe('Pedido inválido')
    expect(validateMoveRequest({ messageId: 1, channelIds: ['a'] })).toBe('Pedido inválido')
    expect(validateMoveRequest({ messageId: 'm', channelIds: [3] })).toBe('Pedido inválido')
    expect(validateMoveRequest({ messageId: 'm', channelIds: [''] })).toBe('Pedido inválido')
  })

  it('pede pelo menos uma sala e salas diferentes', () => {
    expect(validateMoveRequest({ messageId: 'm', channelIds: [null, null] })).toBe('Escolha a sala de pelo menos um time')
    expect(validateMoveRequest({ messageId: 'm', channelIds: ['a', 'a'] })).toBe('Escolha uma sala diferente para cada time')
  })

  it('aceita salas com times que ficam onde estão (null)', () => {
    expect(validateMoveRequest({ messageId: 'm', channelIds: ['a', null, 'b'], extra: 1 })).toEqual({
      messageId: 'm',
      channelIds: ['a', null, 'b']
    })
  })
})

describe('planMoves', () => {
  const teams: Team[] = [{ members: [{ name: 'Ana' }, { name: 'bia#b1' }] }, { members: [{ name: 'Caio' }, { name: 'Duda' }] }]

  it('acha pelo nome ou nome#tag (sem diferenciar maiúsculas) e manda cada time para a sua sala', () => {
    const people = [person('s1', 'a', 'ana'), person('s2', 'b', 'Bia', 'b1'), person('s3', 'c', 'Caio')]
    const { moves, skipped } = planMoves(teams, ['t1', 't2'], people)
    expect(moves).toEqual([
      { name: 'Ana', accountId: 'a', channelId: 't1', socketIds: ['s1'] },
      { name: 'bia#b1', accountId: 'b', channelId: 't1', socketIds: ['s2'] },
      { name: 'Caio', accountId: 'c', channelId: 't2', socketIds: ['s3'] }
    ])
    expect(skipped).toEqual([{ name: 'Duda', reason: 'not-in-voice' }])
  })

  it('nome que bate com duas contas é pulado; o nome#tag desfaz a dúvida', () => {
    const people = [person('s1', 'a1', 'Ana', 'x'), person('s2', 'a2', 'Ana', 'y')]
    expect(planMoves([{ members: [{ name: 'Ana' }] }], ['t1'], people)).toEqual({
      moves: [],
      skipped: [{ name: 'Ana', reason: 'ambiguous' }]
    })
    expect(planMoves([{ members: [{ name: 'Ana#y' }] }], ['t1'], people).moves).toEqual([
      { name: 'Ana#y', accountId: 'a2', channelId: 't1', socketIds: ['s2'] }
    ])
  })

  it('com accountId no resultado, acha pela conta (nome não importa) e junta as conexões dela', () => {
    const people = [person('s1', 'a1', 'Ana'), person('s2', 'a2', 'Ana'), person('s3', 'a2', 'Ana', 'a2', 'outra')]
    const { moves, skipped } = planMoves([{ members: [{ name: 'Apelido', accountId: 'a2' }] }], ['t1'], people)
    expect(moves).toEqual([{ name: 'Apelido', accountId: 'a2', channelId: 't1', socketIds: ['s2', 's3'] }])
    expect(skipped).toEqual([])
  })

  it('a mesma conta duas vezes no sorteio: vale a primeira', () => {
    const people = [person('s1', 'a', 'Ana')]
    const { moves, skipped } = planMoves(
      [{ members: [{ name: 'Ana' }] }, { members: [{ name: 'Outro', accountId: 'a' }] }],
      ['t1', 't2'],
      people
    )
    expect(moves.map((m) => m.channelId)).toEqual(['t1'])
    expect(skipped).toEqual([{ name: 'Outro', reason: 'ambiguous' }])
  })

  it('time sem sala (null) fica onde está e ninguém dele é procurado', () => {
    const { moves, skipped } = planMoves(teams, [null, 't2'], [person('s1', 'a', 'Ana'), person('s3', 'c', 'Caio')])
    expect(moves.map((m) => m.name)).toEqual(['Caio'])
    expect(skipped).toEqual([{ name: 'Duda', reason: 'not-in-voice' }])
  })
})
