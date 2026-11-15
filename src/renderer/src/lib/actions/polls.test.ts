// Enquete no app (v4): criar, votar, encerrar, "meus votos" e o aviso poll:updated atualizando a mensagem na tela.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message, PollResult } from '@shared/types'
import { bindToolsEvents, closePoll, createPoll, loadMyPollVotes, votePoll } from '@/lib/actions/tools'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const result = (counts: number[], extra: Partial<PollResult> = {}): PollResult => ({
  question: 'Qual?',
  options: ['a', 'b'],
  multiple: false,
  counts,
  voters: counts.reduce((x, y) => x + y, 0),
  closed: false,
  ...extra
})

const pollMessage: Message = {
  id: 'p1',
  channelId: 'c1',
  author: { id: 's', accountId: 'acc', name: 'Ana', tag: 'ana1', color: '#000', avatarUrl: null },
  content: 'texto antigo',
  attachments: [],
  createdAt: 1,
  kind: 'tool',
  tool: { tool: 'poll', result: result([0, 0]) }
}
const textMessage: Message = { ...pollMessage, id: 't1', content: 'oi', kind: undefined, tool: undefined }

let socket: FakeSocket
beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindToolsEvents(socket.asSocket())
  useApp.setState({ ...initialState, messages: { c1: [textMessage, pollMessage] } })
})
afterEach(() => setSocket(null))

const pollInStore = (): Message => useApp.getState().messages.c1.find((m) => m.id === 'p1')!

describe('enquete no app', () => {
  it('poll:updated troca o resultado e o texto da mensagem carregada (outras mensagens e canais ficam iguais)', () => {
    socket.receive('poll:updated', { messageId: 'p1', channelId: 'c1', result: result([2, 1]) })
    expect(pollInStore().tool).toEqual({ tool: 'poll', result: result([2, 1]) })
    expect(pollInStore().content).toBe('📊 Enquete: Qual? — a: 2, b: 1 (3 pessoas)')
    expect(useApp.getState().messages.c1[0]).toBe(textMessage)
    socket.receive('poll:updated', { messageId: 'p9', channelId: 'outro', result: result([1, 0]) }) // não carregado: ignora
    expect(useApp.getState().messages.outro).toBeUndefined()
  })

  it('createPoll manda pergunta, opções e `multiple`', async () => {
    socket.replyTo('tools:poll', () => ({ ok: true, message: pollMessage }))
    await expect(createPoll('c1', 'Qual?', ['a', 'b'], true)).resolves.toEqual(pollMessage)
    expect(socket.sent('tools:poll')[0][0]).toEqual({ channelId: 'c1', question: 'Qual?', options: ['a', 'b'], multiple: true })
  })

  it('votePoll atualiza a mensagem e os meus votos na hora; erro vira exceção', async () => {
    socket.replyTo('poll:vote', () => ({ ok: true, result: result([0, 1]), mine: [1] }))
    await votePoll('c1', 'p1', [1])
    expect(socket.sent('poll:vote')[0][0]).toEqual({ messageId: 'p1', choices: [1] })
    expect(useApp.getState().myPollVotes).toEqual({ p1: [1] })
    expect(pollInStore().tool).toEqual({ tool: 'poll', result: result([0, 1]) })
    socket.replyTo('poll:vote', () => ({ ok: false, error: 'Esta enquete já foi encerrada' }))
    await expect(votePoll('c1', 'p1', [0])).rejects.toThrow('Esta enquete já foi encerrada')
  })

  it('closePoll encerra e atualiza a mensagem', async () => {
    socket.replyTo('poll:close', () => ({ ok: true, result: result([1, 0], { closed: true }) }))
    await closePoll('c1', 'p1')
    expect(socket.sent('poll:close')[0][0]).toBe('p1')
    expect(pollInStore().content).toBe('📊 Enquete (encerrada): Qual? — a: 1, b: 0 (1 pessoa)')
  })

  it('loadMyPollVotes pede só as enquetes e guarda [] para quem não votou', async () => {
    const other = { ...pollMessage, id: 'p2' }
    socket.replyTo('poll:mine', () => ({ p1: [0] }))
    await loadMyPollVotes([textMessage, pollMessage, other])
    expect(socket.sent('poll:mine')[0][0]).toEqual(['p1', 'p2'])
    expect(useApp.getState().myPollVotes).toEqual({ p1: [0], p2: [] })
    await loadMyPollVotes([textMessage]) // sem enquete: nem pergunta
    expect(socket.sent('poll:mine')).toHaveLength(1)
  })
})
