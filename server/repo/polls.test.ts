// Repo das enquetes sobre o banco de verdade: votos, contagens gravadas na mensagem, encerrar e "meus votos".
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Message, PollResult } from '../../src/shared/types'
import { openTestDatabase } from '../tests/database'
import { insertAccount } from './accounts'
import { deleteChannel, insertChannel } from './channels'
import { insertMessage, listMessages } from './messages'
import { channelsOfMessages, closePoll, findPoll, setVote, votesOf } from './polls'

let cleanup: () => Promise<void>
let channelId: string

beforeAll(async () => {
  cleanup = await openTestDatabase()
  channelId = randomUUID()
  await insertChannel({ id: channelId, name: `enquetes-${randomUUID().slice(0, 8)}`, type: 'text', createdAt: Date.now() })
})
afterAll(async () => {
  await cleanup?.()
})

async function account(): Promise<string> {
  const a = await insertAccount({
    id: randomUUID(),
    email: `voto-${randomUUID().slice(0, 8)}@teste.com`,
    name: 'Votante',
    tag: `v${randomUUID().slice(0, 8)}`,
    tagLocked: true,
    color: '#5865f2',
    passwordHash: null,
    googleId: null,
    avatarType: null,
    avatarVersion: 0,
    createdAt: Date.now()
  })
  return a.id
}

async function poll(options = ['a', 'b', 'c'], multiple = false, inChannel = channelId): Promise<{ id: string; author: string }> {
  const author = await account()
  const result: PollResult = { question: 'Qual?', options, multiple, counts: options.map(() => 0), voters: 0, closed: false }
  const message: Message = {
    id: randomUUID(),
    channelId: inChannel,
    author: { id: author, accountId: author, name: 'Autor', tag: 'aut', color: '#000', avatarUrl: null },
    content: 'enquete',
    attachments: [],
    createdAt: Date.now(),
    kind: 'tool',
    tool: { tool: 'poll', result }
  }
  await insertMessage(message)
  return { id: message.id, author }
}

describe('enquetes', () => {
  it('findPoll: só mensagens de enquete; ids inválidos viram "não existe"', async () => {
    const p = await poll()
    expect(await findPoll(p.id)).toMatchObject({ messageId: p.id, channelId, authorId: p.author, result: { question: 'Qual?' } })
    expect(await findPoll(randomUUID())).toBeUndefined()
    expect(await findPoll('lixo')).toBeUndefined()
  })

  it('votar conta por opção e por pessoa; trocar e tirar o voto recalculam; a mensagem guarda o resultado', async () => {
    const p = await poll()
    const [x, y] = [await account(), await account()]
    expect(await setVote(p.id, x, [1])).toMatchObject({ counts: [0, 1, 0], voters: 1 })
    expect(await setVote(p.id, y, [1])).toMatchObject({ counts: [0, 2, 0], voters: 2 })
    expect(await setVote(p.id, x, [2])).toMatchObject({ counts: [0, 1, 1], voters: 2 }) // trocou
    expect(await setVote(p.id, y, [])).toMatchObject({ counts: [0, 0, 1], voters: 1 }) // tirou

    // o histórico já vem com o resultado e o texto por extenso atualizados
    const saved = (await listMessages(channelId)).messages.find((m) => m.id === p.id)!
    expect(saved.tool).toEqual({ tool: 'poll', result: expect.objectContaining({ counts: [0, 0, 1], voters: 1 }) })
    expect(saved.content).toBe('📊 Enquete: Qual? — a: 0, b: 0, c: 1 (1 pessoa)')
  })

  it('enquete múltipla: uma pessoa marca várias e conta uma vez em `voters`', async () => {
    const p = await poll(['a', 'b', 'c'], true)
    const x = await account()
    expect(await setVote(p.id, x, [0, 2])).toMatchObject({ counts: [1, 0, 1], voters: 1 })
  })

  it('votos ao mesmo tempo de várias pessoas não se perdem', async () => {
    const p = await poll(['a', 'b'])
    const people = await Promise.all(Array.from({ length: 8 }, () => account()))
    await Promise.all(people.map((id, i) => setVote(p.id, id, [i % 2])))
    expect((await findPoll(p.id))?.result).toMatchObject({ counts: [4, 4], voters: 8 })
  })

  it('encerrar marca `closed` e mantém as contagens', async () => {
    const p = await poll()
    await setVote(p.id, await account(), [0])
    expect(await closePoll(p.id)).toMatchObject({ closed: true, counts: [1, 0, 0] })
    expect((await findPoll(p.id))?.result.closed).toBe(true)
    expect(await closePoll(randomUUID())).toBeUndefined()
  })

  it('votesOf devolve só os meus votos, ordenados; channelsOfMessages diz o canal de cada mensagem', async () => {
    const p1 = await poll(['a', 'b', 'c'], true)
    const p2 = await poll()
    const me = await account()
    await setVote(p1.id, me, [2, 0])
    await setVote(p2.id, await account(), [1])
    expect(await votesOf(me, [p1.id, p2.id, 'lixo'])).toEqual({ [p1.id]: [0, 2] })
    expect(await votesOf(me, [])).toEqual({})
    expect(await channelsOfMessages([p1.id, 'lixo'])).toEqual(new Map([[p1.id, channelId]]))
  })

  it('o banco recusa índice fora de 0–9 e apagar o canal leva os votos junto', async () => {
    const other = randomUUID()
    await insertChannel({ id: other, name: `tmp-${randomUUID().slice(0, 8)}`, type: 'text', createdAt: Date.now() })
    const p = await poll(['a', 'b'], false, other)
    const x = await account()
    await expect(setVote(p.id, x, [10])).rejects.toThrow()
    await setVote(p.id, x, [1])
    expect(await deleteChannel(other)).toBe(true)
    expect(await votesOf(x, [p.id])).toEqual({})
  })
})
