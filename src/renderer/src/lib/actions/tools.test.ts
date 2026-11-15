// Ação do sorteador de times (v4): o que vai para o servidor e o erro legível.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message } from '@shared/types'
import { drawTeams } from '@/lib/actions/tools'
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
