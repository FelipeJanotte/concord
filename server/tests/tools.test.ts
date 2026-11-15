// Ferramentas do grupo (A8) no servidor real: o sorteio roda no servidor e vira mensagem `kind: 'tool'` no canal.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, type TeamPlayer, type TeamsRequest } from '../../src/shared/types'
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

const players = (count: number): TeamPlayer[] => Array.from({ length: count }, (_, i) => ({ name: `Jogador ${i + 1}` }))
const request = (channelId: string, extra: Partial<TeamsRequest> = {}): TeamsRequest => ({ channelId, players: players(10), teamCount: 2, ...extra })

describe('tools:teams', () => {
  it('posta o resultado no canal: todos recebem a MESMA mensagem kind tool, e ela fica no histórico', async () => {
    const a = await user()
    const b = await user()
    const ch = await server.createChannel('sorteios')
    const forB = waitFor(b.socket, 'message:new', (m) => m.channelId === ch.id)
    const res = await a.socket.emitWithAck('tools:teams', request(ch.id, { lanes: true }))
    if (!res.ok) throw new Error(res.error)
    const [got] = await forB
    expect(got).toEqual(res.message)
    expect(got).toMatchObject({ kind: 'tool', author: { accountId: a.account.id }, tool: { tool: 'teams', result: { lanes: true } } })
    if (got.tool?.tool !== 'teams') throw new Error('esperava o resultado do sorteador de times')
    const teams = got.tool.result.teams
    expect(teams).toHaveLength(2)
    expect(teams.every((t) => t.members.length === 5 && new Set(t.members.map((m) => m.lane)).size === 5)).toBe(true)
    expect(got.content.split('\n')[0]).toBe('Times sorteados')

    const history = await b.socket.emitWithAck('message:history', { channelId: ch.id })
    const saved = history.messages.find((m) => m.id === got.id)
    expect(saved).toMatchObject({ kind: 'tool', tool: got.tool, content: got.content })
  })

  it('erros de validação voltam no ack e nada é postado', async () => {
    const a = await user()
    const ch = await server.createChannel('sorteios-erros')
    const silent = expectNoEvent(a.socket, 'message:new', (m) => m.channelId === ch.id)
    expect(await a.socket.emitWithAck('tools:teams', request(ch.id, { players: players(1) }))).toEqual({
      ok: false,
      error: 'Coloque pelo menos 2 pessoas'
    })
    expect(await a.socket.emitWithAck('tools:teams', request(ch.id, { players: players(11), lanes: true }))).toEqual({
      ok: false,
      error: 'Com lanes, cada time pode ter no máximo 5 pessoas: aumente o número de times'
    })
    expect(await a.socket.emitWithAck('tools:teams', request(ch.id, { teamCount: 20 }))).toEqual({
      ok: false,
      error: 'O número de times vai de 2 a 10'
    })
    await silent
  })

  it('canal inexistente, de voz ou que a pessoa não vê: "Canal não encontrado"; sem enviar: recusa', async () => {
    const a = await user()
    const voice = await server.createChannel('Sala do sorteio', 'voice')
    const secret = await server.createChannel('secreto-sorteio')
    const quiet = await server.createChannel('sem-enviar-sorteio')
    for (const [id, deny] of [
      [secret.id, ['view']],
      [quiet.id, ['send']]
    ] as const) {
      const res = await owner.socket.emitWithAck('channel:set-overrides', {
        channelId: id,
        overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: [...deny] }]
      })
      expect(res.ok).toBe(true)
    }
    const notFound = { ok: false, error: 'Canal não encontrado' }
    expect(await a.socket.emitWithAck('tools:teams', request('11111111-1111-1111-1111-111111111111'))).toEqual(notFound)
    expect(await a.socket.emitWithAck('tools:teams', request('lixo'))).toEqual(notFound)
    expect(await a.socket.emitWithAck('tools:teams', request(voice.id))).toEqual(notFound)
    expect(await a.socket.emitWithAck('tools:teams', request(secret.id))).toEqual(notFound)
    expect(await a.socket.emitWithAck('tools:teams', request(quiet.id))).toEqual({ ok: false, error: 'Você não pode enviar mensagens neste canal' })
    // a dona pode tudo
    expect((await owner.socket.emitWithAck('tools:teams', request(secret.id))).ok).toBe(true)
  })

  it('funciona numa conversa privada (só os dois recebem)', async () => {
    const a = await user()
    const b = await user()
    const stranger = await user()
    await a.socket.emitWithAck('friend:request', `${b.name}#${b.tag}`)
    await b.socket.emitWithAck('friend:accept', a.account.id)
    const dm = await a.socket.emitWithAck('dm:open', b.account.id)
    if (!dm.ok) throw new Error(dm.error)
    const forB = waitFor(b.socket, 'message:new', (m) => m.channelId === dm.dm.channel.id && m.kind === 'tool')
    const notStranger = expectNoEvent(stranger.socket, 'message:new', (m) => m.channelId === dm.dm.channel.id)
    expect((await a.socket.emitWithAck('tools:teams', request(dm.dm.channel.id, { players: players(4) }))).ok).toBe(true)
    await forB
    await notStranger
  })

  it('o app não consegue forjar uma mensagem de ferramenta pelo message:send', async () => {
    const a = await user()
    const ch = await server.createChannel('sem-forjar')
    const got = waitFor(a.socket, 'message:new', (m) => m.channelId === ch.id)
    const forged = { channelId: ch.id, content: 'Times sorteados', kind: 'tool', tool: { tool: 'teams', result: { lanes: false, teams: [] } } }
    a.socket.emit('message:send', forged as never)
    const [m] = await got
    expect(m.kind).toBeUndefined()
    expect(m.tool).toBeUndefined()
    const history = await a.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages[0].kind).toBeUndefined()
  })
})

describe('dado, moeda e sortear 1', () => {
  it('dado: todos recebem o mesmo resultado (kind tool), com valores na faixa, e ele fica no histórico', async () => {
    const a = await user()
    const b = await user()
    const ch = await server.createChannel('dados')
    const forB = waitFor(b.socket, 'message:new', (m) => m.channelId === ch.id)
    const res = await a.socket.emitWithAck('tools:dice', { channelId: ch.id, sides: 20, count: 3 })
    if (!res.ok) throw new Error(res.error)
    const [got] = await forB
    expect(got).toEqual(res.message)
    if (got.tool?.tool !== 'dice') throw new Error('esperava o resultado do dado')
    const { rolls, total, sides } = got.tool.result
    expect(sides).toBe(20)
    expect(rolls).toHaveLength(3)
    expect(rolls.every((r) => Number.isInteger(r) && r >= 1 && r <= 20)).toBe(true)
    expect(total).toBe(rolls.reduce((x, y) => x + y, 0))
    expect(got.content).toBe(`🎲 3d20: ${rolls.join(' + ')} = ${total}`)
    const history = await b.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.find((m) => m.id === got.id)?.tool).toEqual(got.tool)
  })

  it('moeda e sortear 1 postam o resultado; erros voltam no ack sem postar', async () => {
    const a = await user()
    const ch = await server.createChannel('moedas')
    const coin = await a.socket.emitWithAck('tools:coin', { channelId: ch.id, count: 2 })
    if (!coin.ok || coin.message.tool?.tool !== 'coin') throw new Error('moeda falhou')
    expect(coin.message.tool.result.flips.every((f) => f === 'cara' || f === 'coroa')).toBe(true)

    const pick = await a.socket.emitWithAck('tools:pick', { channelId: ch.id, options: ['Ana', ' Bia ', '', 'Caio'] })
    if (!pick.ok || pick.message.tool?.tool !== 'pick') throw new Error('sorteio falhou')
    expect(pick.message.tool.result.options).toEqual(['Ana', 'Bia', 'Caio'])
    expect(['Ana', 'Bia', 'Caio']).toContain(pick.message.tool.result.picked)

    const silent = expectNoEvent(a.socket, 'message:new', (m) => m.channelId === ch.id)
    expect(await a.socket.emitWithAck('tools:dice', { channelId: ch.id, sides: 1, count: 1 })).toEqual({
      ok: false,
      error: 'O dado precisa ter de 2 a 100 lados'
    })
    expect(await a.socket.emitWithAck('tools:coin', { channelId: ch.id, count: 50 })).toEqual({ ok: false, error: 'Jogue de 1 a 10 moedas' })
    expect(await a.socket.emitWithAck('tools:pick', { channelId: ch.id, options: ['Só uma'] })).toEqual({
      ok: false,
      error: 'Coloque pelo menos 2 opções'
    })
    await silent
  })

  it('mesmas regras de canal das outras ferramentas: voz e inexistente recusados', async () => {
    const a = await user()
    const voice = await server.createChannel('Sala dos dados', 'voice')
    const notFound = { ok: false, error: 'Canal não encontrado' }
    expect(await a.socket.emitWithAck('tools:dice', { channelId: voice.id, sides: 6, count: 1 })).toEqual(notFound)
    expect(await a.socket.emitWithAck('tools:coin', { channelId: 'lixo', count: 1 })).toEqual(notFound)
    expect(await a.socket.emitWithAck('tools:pick', { channelId: '11111111-1111-1111-1111-111111111111', options: ['a', 'b'] })).toEqual(
      notFound
    )
  })
})
