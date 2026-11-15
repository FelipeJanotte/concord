// Ação do sorteador de times (v4): o que vai para o servidor e o erro legível.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@shared/types'
import { bindToolsEvents, drawTeams, flipCoin, moveTeams, pickOne, rollDice } from '@/lib/actions/tools'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
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

describe('mover os times para salas de voz', () => {
  it('drawTeams leva o accountId de quem veio da sala de voz', async () => {
    socket.replyTo('tools:teams', () => ({ ok: true, message: posted }))
    await drawTeams({ channelId: 'c1', players: [{ name: 'Ana', accountId: 'acc-ana' }, { name: 'Bia' }], teamCount: 2 })
    expect(socket.sent('tools:teams')[0][0]).toMatchObject({ players: [{ name: 'Ana', accountId: 'acc-ana' }, { name: 'Bia' }] })
  })

  it('moveTeams manda a mensagem e as salas e devolve quem foi movido e quem foi pulado', async () => {
    const skipped = [{ name: 'Duda', reason: 'not-in-voice' as const }]
    socket.replyTo('tools:move-teams', () => ({ ok: true, moved: 3, skipped }))
    await expect(moveTeams('m1', ['t1', null])).resolves.toEqual({ moved: 3, skipped })
    expect(socket.sent('tools:move-teams')[0][0]).toEqual({ messageId: 'm1', channelIds: ['t1', null] })
  })

  it('erro do servidor vira exceção com a mensagem dele', async () => {
    socket.replyTo('tools:move-teams', () => ({ ok: false, error: 'Sorteio de times não encontrado' }))
    await expect(moveTeams('m1', ['t1'])).rejects.toThrow('Sorteio de times não encontrado')
  })

  describe('tools:moved', () => {
    beforeEach(() => {
      bindToolsEvents(socket.asSocket())
      useApp.setState({ ...initialState, self: { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null } })
    })
    afterEach(() => vi.restoreAllMocks())

    it('na voz: avisa quem levou e entra na sala do time', async () => {
      const join = vi.spyOn(voice, 'join').mockResolvedValue({ micError: null, cancelled: false, canSpeak: true, canShare: true })
      useApp.setState({ myVoiceChannelId: 'lobby' })
      socket.receive('tools:moved', { channelId: 'time-1', by: 'Dona' })
      expect(useApp.getState().notice?.text).toBe('Dona levou você para a sala do seu time.')
      expect(join).toHaveBeenCalledWith('time-1')
      await vi.waitFor(() => expect(useApp.getState().myVoiceChannelId).toBe('time-1'))
    })

    it('fora da voz (já saiu) ou já na sala: ignora', () => {
      const join = vi.spyOn(voice, 'join')
      socket.receive('tools:moved', { channelId: 'time-1', by: 'Dona' })
      useApp.setState({ myVoiceChannelId: 'time-1' })
      socket.receive('tools:moved', { channelId: 'time-1', by: 'Dona' })
      expect(join).not.toHaveBeenCalled()
      expect(useApp.getState().notice).toBeNull()
    })
  })
})

describe('drawTeams com lanes disponíveis', () => {
  it('manda laneSet só com lanes ligadas e quando não são todas', async () => {
    socket.replyTo('tools:teams', () => ({ ok: true, message: posted }))
    const base = { channelId: 'c1', players: [{ name: 'Ana' }, { name: 'Bia' }], teamCount: 2 }
    await drawTeams({ ...base, lanes: true, laneSet: ['top', 'mid'] })
    await drawTeams({ ...base, lanes: true, laneSet: ['top', 'jungle', 'mid', 'adc', 'support'] })
    await drawTeams({ ...base, lanes: false, laneSet: ['top'] })
    const sent = socket.sent('tools:teams').map((a) => a[0] as { laneSet?: unknown })
    expect(sent.map((r) => r.laneSet)).toEqual([['top', 'mid'], undefined, undefined])
  })
})
