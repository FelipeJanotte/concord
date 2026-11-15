// Enquetes (v4) no servidor real: criar, votar (único e múltiplo), avisos para quem vê o canal,
// encerrar (autor ou manageMessages), "meus votos" e canais privados.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, type Message, type PollRequest } from '../../src/shared/types'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

let server: TestServer
let owner: TestUser
const open: ClientSocket[] = []
let n = 0

beforeAll(async () => {
  server = await TestServer.start()
  owner = await server.asOwner()
})

afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

afterAll(async () => {
  await server?.destroy()
})

async function user(): Promise<TestUser> {
  const u = await server.newUser(`Pessoa ${++n}`)
  open.push(u.socket)
  return u
}

async function createPoll(u: TestUser, channelId: string, extra: Partial<PollRequest> = {}): Promise<Message> {
  const res = await u.socket.emitWithAck('tools:poll', { channelId, question: 'Qual mapa?', options: ['Dust 2', 'Mirage', 'Inferno'], ...extra })
  if (!res.ok) throw new Error(res.error)
  return res.message
}

describe('criar e votar', () => {
  it('a enquete chega para todos sem votos; o voto atualiza todos (anônimo) e quem votou recebe `mine`', async () => {
    const a = await user()
    const b = await user()
    const ch = await server.createChannel(`enquete-${n}`)
    const forB = waitFor(b.socket, 'message:new', (m) => m.channelId === ch.id)
    const poll = await createPoll(a, ch.id)
    expect((await forB)[0].tool).toEqual({
      tool: 'poll',
      result: { question: 'Qual mapa?', options: ['Dust 2', 'Mirage', 'Inferno'], multiple: false, counts: [0, 0, 0], voters: 0, closed: false }
    })

    const updated = waitFor(a.socket, 'poll:updated', (p) => p.messageId === poll.id)
    const vote = await b.socket.emitWithAck('poll:vote', { messageId: poll.id, choices: [1] })
    expect(vote).toMatchObject({ ok: true, mine: [1], result: { counts: [0, 1, 0], voters: 1 } })
    const [payload] = await updated
    expect(payload).toEqual({ messageId: poll.id, channelId: ch.id, result: expect.objectContaining({ counts: [0, 1, 0], voters: 1 }) })
    expect(JSON.stringify(payload)).not.toContain(b.account.id) // não revela quem votou

    // trocar e tirar
    expect(await b.socket.emitWithAck('poll:vote', { messageId: poll.id, choices: [2] })).toMatchObject({ result: { counts: [0, 0, 1] } })
    expect(await b.socket.emitWithAck('poll:vote', { messageId: poll.id, choices: [] })).toMatchObject({
      mine: [],
      result: { counts: [0, 0, 0], voters: 0 }
    })
  })

  it('voto único recusa várias opções; múltipla aceita; índice inválido recusado', async () => {
    const a = await user()
    const ch = await server.createChannel(`enquete-${n}-b`)
    const single = await createPoll(a, ch.id)
    expect(await a.socket.emitWithAck('poll:vote', { messageId: single.id, choices: [0, 1] })).toEqual({
      ok: false,
      error: 'Esta enquete aceita só uma opção'
    })
    expect(await a.socket.emitWithAck('poll:vote', { messageId: single.id, choices: [9] })).toEqual({ ok: false, error: 'Opção inválida' })
    const multi = await createPoll(a, ch.id, { multiple: true })
    expect(await a.socket.emitWithAck('poll:vote', { messageId: multi.id, choices: [2, 0] })).toMatchObject({
      ok: true,
      mine: [0, 2],
      result: { counts: [1, 0, 1], voters: 1 }
    })
  })

  it('o histórico traz o resultado atual e `poll:mine` os meus votos', async () => {
    const a = await user()
    const b = await user()
    const ch = await server.createChannel(`enquete-${n}-c`)
    const poll = await createPoll(a, ch.id, { multiple: true })
    await a.socket.emitWithAck('poll:vote', { messageId: poll.id, choices: [0] })
    await b.socket.emitWithAck('poll:vote', { messageId: poll.id, choices: [0, 2] })
    const history = await a.socket.emitWithAck('message:history', { channelId: ch.id })
    const saved = history.messages.find((m) => m.id === poll.id)!
    expect(saved.tool).toMatchObject({ tool: 'poll', result: { counts: [2, 0, 1], voters: 2 } })
    expect(saved.content).toBe('📊 Enquete: Qual mapa? — Dust 2: 2, Mirage: 0, Inferno: 1 (2 pessoas)')
    expect(await b.socket.emitWithAck('poll:mine', [poll.id, 'lixo'])).toEqual({ [poll.id]: [0, 2] })
  })

  it('criar com erro volta no ack sem postar', async () => {
    const a = await user()
    const ch = await server.createChannel(`enquete-${n}-d`)
    const silent = expectNoEvent(a.socket, 'message:new', (m) => m.channelId === ch.id)
    expect(await a.socket.emitWithAck('tools:poll', { channelId: ch.id, question: 'Q', options: ['só uma'] })).toEqual({
      ok: false,
      error: 'Coloque pelo menos 2 opções'
    })
    await silent
  })
})

describe('encerrar', () => {
  it('só o autor (ou manageMessages, como a dona) encerra; depois ninguém vota', async () => {
    const a = await user()
    const b = await user()
    const ch = await server.createChannel(`enquete-${n}-e`)
    const poll = await createPoll(a, ch.id)
    await b.socket.emitWithAck('poll:vote', { messageId: poll.id, choices: [0] })
    expect(await b.socket.emitWithAck('poll:close', poll.id)).toEqual({ ok: false, error: 'Só quem criou a enquete pode encerrá-la' })

    const forB = waitFor(b.socket, 'poll:updated', (p) => p.messageId === poll.id && p.result.closed)
    expect(await a.socket.emitWithAck('poll:close', poll.id)).toMatchObject({ ok: true, result: { closed: true, counts: [1, 0, 0] } })
    await forB
    expect(await b.socket.emitWithAck('poll:vote', { messageId: poll.id, choices: [1] })).toEqual({
      ok: false,
      error: 'Esta enquete já foi encerrada'
    })
    expect(await a.socket.emitWithAck('poll:close', poll.id)).toEqual({ ok: false, error: 'Esta enquete já foi encerrada' })

    const other = await createPoll(a, ch.id)
    expect((await owner.socket.emitWithAck('poll:close', other.id)).ok).toBe(true)
  })
})

describe('canais privados', () => {
  it('quem não vê o canal: a enquete "não existe" (votar, encerrar, poll:mine) e não recebe poll:updated', async () => {
    const outsider = await user()
    const ch = await server.createChannel(`enquete-secreta-${n}`)
    const rules = await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: ch.id,
      overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] }]
    })
    expect(rules.ok).toBe(true)
    const poll = await createPoll(owner, ch.id)
    const silent = expectNoEvent(outsider.socket, 'poll:updated', (p) => p.messageId === poll.id)
    await owner.socket.emitWithAck('poll:vote', { messageId: poll.id, choices: [0] })
    await silent
    expect(await outsider.socket.emitWithAck('poll:vote', { messageId: poll.id, choices: [0] })).toEqual({
      ok: false,
      error: 'Enquete não encontrada'
    })
    expect(await outsider.socket.emitWithAck('poll:close', poll.id)).toEqual({ ok: false, error: 'Enquete não encontrada' })
    expect(await outsider.socket.emitWithAck('poll:mine', [poll.id])).toEqual({})
  })

  it('sem "enviar" no canal: vê a enquete mas não vota', async () => {
    const reader = await user()
    const ch = await server.createChannel(`enquete-leitura-${n}`)
    const poll = await createPoll(owner, ch.id)
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: ch.id,
      overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['send'] }]
    })
    expect(await reader.socket.emitWithAck('poll:vote', { messageId: poll.id, choices: [0] })).toEqual({
      ok: false,
      error: 'Você não pode votar neste canal'
    })
  })
})
