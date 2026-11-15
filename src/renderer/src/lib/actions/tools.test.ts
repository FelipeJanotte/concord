// Ação do sorteador de times (v4): o que vai para o servidor e o erro legível.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message } from '@shared/types'
import { drawTeams, flipCoin, pickOne, rollDice } from '@/lib/actions/tools'
import { setSocket } from '@/lib/core'
import { FakeSocket } from '@/test/fake-socket'

let socket: FakeSocket
beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
})
afterEach(() => setSocket(null))

const posted = { id: 'm1', kind: 'tool' } as Message

describe('drawTeams', () => {
  it('limpa nomes (espaços, vazios), manda lanes só quando ligadas e devolve a mensagem postada', async () => {
    socket.replyTo('tools:teams', () => ({ ok: true, message: posted }))
    const players = [{ name: '  Ana   Maria ', lanes: ['mid' as const] }, { name: '   ' }, { name: 'Bia', lanes: [] }]
    await expect(drawTeams({ channelId: 'c1', players, teamCount: 2 })).resolves.toEqual(posted)
    expect(socket.sent('tools:teams')[0][0]).toEqual({
      channelId: 'c1',
      players: [{ name: 'Ana Maria' }, { name: 'Bia' }],
      teamCount: 2,
      lanes: false
    })
    await drawTeams({ channelId: 'c1', players, teamCount: 2, lanes: true })
    expect(socket.sent('tools:teams')[1][0]).toMatchObject({ players: [{ name: 'Ana Maria', lanes: ['mid'] }, { name: 'Bia' }], lanes: true })
  })

  it('erro do servidor vira exceção com a mensagem dele', async () => {
    socket.replyTo('tools:teams', () => ({ ok: false, error: 'Coloque pelo menos 2 pessoas' }))
    await expect(drawTeams({ channelId: 'c1', players: [{ name: 'Ana' }], teamCount: 2 })).rejects.toThrow('Coloque pelo menos 2 pessoas')
  })
})

describe('dado, moeda e sortear 1', () => {
  it('mandam os parâmetros certos (com padrões) e devolvem a mensagem postada', async () => {
    socket.replyTo('tools:dice', () => ({ ok: true, message: posted }))
    socket.replyTo('tools:coin', () => ({ ok: true, message: posted }))
    socket.replyTo('tools:pick', () => ({ ok: true, message: posted }))
    await expect(rollDice('c1', 20)).resolves.toEqual(posted)
    await rollDice('c1', 6, 2)
    await flipCoin('c1')
    await pickOne('c1', 'Ana\nBia\r\n\nCaio')
    await pickOne('c1', ['X', 'Y'])
    expect(socket.sent('tools:dice').map((a) => a[0])).toEqual([
      { channelId: 'c1', sides: 20, count: 1 },
      { channelId: 'c1', sides: 6, count: 2 }
    ])
    expect(socket.sent('tools:coin')[0][0]).toEqual({ channelId: 'c1', count: 1 })
    expect(socket.sent('tools:pick').map((a) => a[0])).toEqual([
      { channelId: 'c1', options: ['Ana', 'Bia', '', 'Caio'] },
      { channelId: 'c1', options: ['X', 'Y'] }
    ])
  })

  it('erro do servidor vira exceção com a mensagem dele', async () => {
    socket.replyTo('tools:dice', () => ({ ok: false, error: 'O dado precisa ter de 2 a 100 lados' }))
    await expect(rollDice('c1', 1)).rejects.toThrow('O dado precisa ter de 2 a 100 lados')
  })
})
