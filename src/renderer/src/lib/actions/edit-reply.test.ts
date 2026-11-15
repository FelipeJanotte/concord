// Editar (A15) e responder citando (B18) no app: o que vai para o servidor e o que muda na store.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message, User } from '@shared/types'
import { bindMessageEvents, cancelReply, editLastMessage, editMessage, sendMessage, startEdit, startReply } from '@/lib/actions/messages'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const msg = (id: string, author: User, content: string, over: Partial<Message> = {}): Message => ({
  id,
  channelId: 'geral',
  author,
  content,
  attachments: [],
  createdAt: 1,
  ...over
})

let socket: FakeSocket
const st = () => useApp.getState()

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindMessageEvents(socket.asSocket())
  useApp.setState({
    ...initialState,
    self: me,
    messages: {
      geral: [
        msg('m1', ana, 'pergunta'),
        msg('m2', me, 'minha antiga'),
        msg('m3', me, 'resposta', { replyTo: { id: 'm1', authorName: 'Ana', authorAccountId: 'acc-ana', content: 'pergunta' } }),
        msg('m4', me, '🎲 d6: 3', { kind: 'tool', tool: { tool: 'dice', result: { sides: 6, rolls: [3], total: 3 } } })
      ]
    }
  })
})
afterEach(() => setSocket(null))

describe('responder', () => {
  it('startReply guarda o resumo; o envio leva replyToId e limpa a resposta', () => {
    startReply(msg('m1', ana, `  muito   texto ${'x'.repeat(200)}`))
    expect(st().replyingTo.geral).toMatchObject({ id: 'm1', authorName: 'Ana', authorAccountId: 'acc-ana' })
    expect(st().replyingTo.geral.content).toHaveLength(100)
    expect(sendMessage('geral', 'beleza')).toBe(true)
    expect(socket.sent('message:send')[0][0]).toEqual({ channelId: 'geral', content: 'beleza', replyToId: 'm1' })
    expect(st().replyingTo.geral).toBeUndefined()
    sendMessage('geral', 'sem resposta')
    expect(socket.sent('message:send')[1][0]).toEqual({ channelId: 'geral', content: 'sem resposta' })
  })

  it('cancelar tira a resposta; começar a responder fecha uma edição aberta', () => {
    startEdit('m2')
    startReply(msg('m1', ana, 'pergunta'))
    expect(st().editingMessageId).toBeNull()
    cancelReply('geral')
    expect(st().replyingTo).toEqual({})
  })

  it('original apagada: a citação vira "mensagem apagada"', () => {
    socket.receive('message:deleted', { channelId: 'geral', messageId: 'm1' })
    expect(st().messages.geral.find((m) => m.id === 'm3')?.replyTo).toEqual({ id: 'm1', authorName: '', authorAccountId: null, content: '', deleted: true })
  })
})

describe('editar', () => {
  it('message:edited troca o texto, marca editada e atualiza as citações', () => {
    socket.receive('message:edited', { channelId: 'geral', messageId: 'm1', content: 'pergunta  nova', editedAt: 99 })
    const list = st().messages.geral
    expect(list[0]).toMatchObject({ content: 'pergunta  nova', editedAt: 99 })
    expect(list[2].replyTo?.content).toBe('pergunta nova')
  })

  it('editMessage manda o texto limpo, aplica na hora e fecha a edição', async () => {
    socket.replyTo('message:edit', () => ({ ok: true }))
    startEdit('m2')
    await editMessage(st().messages.geral[1], '  minha nova  ')
    expect(socket.sent('message:edit')[0][0]).toEqual({ messageId: 'm2', content: 'minha nova' })
    expect(st().messages.geral[1].content).toBe('minha nova')
    expect(st().messages.geral[1].editedAt).toBeGreaterThan(0)
    expect(st().editingMessageId).toBeNull()
  })

  it('mesmo texto só fecha (não pede ao servidor); erro do servidor vira exceção e mantém aberta', async () => {
    startEdit('m2')
    await editMessage(st().messages.geral[1], ' minha antiga ')
    expect(socket.sent('message:edit')).toHaveLength(0)
    expect(st().editingMessageId).toBeNull()
    socket.replyTo('message:edit', () => ({ ok: false, error: 'A mensagem não pode ficar vazia (para tirar, apague)' }))
    startEdit('m2')
    await expect(editMessage(st().messages.geral[1], '')).rejects.toThrow('A mensagem não pode ficar vazia')
    expect(st().editingMessageId).toBe('m2')
  })

  it('seta para cima: abre a minha última mensagem de texto (pula ferramenta e dos outros)', () => {
    expect(editLastMessage('geral')).toBe(true)
    expect(st().editingMessageId).toBe('m3')
    useApp.setState({ editingMessageId: null, messages: { geral: [msg('x', ana, 'só da Ana')] } })
    expect(editLastMessage('geral')).toBe(false)
    expect(editLastMessage('vazio')).toBe(false)
  })
})
