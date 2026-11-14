// O que é salvo sobrevive a um reinício do servidor.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TestServer, waitFor } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await TestServer.start()
})

afterAll(async () => {
  await server?.destroy()
})

describe('persistência', () => {
  it('contas, sessões, canais, mensagens e perfil continuam depois de reiniciar', async () => {
    const a = await server.newUser('Persistente')
    const created = await a.socket.emitWithAck('channel:create', { name: 'guardado', type: 'text' })
    if (!created.ok) throw new Error(created.error)
    const msg = waitFor(a.socket, 'message:new', (m) => m.channelId === created.channel.id)
    a.socket.emit('message:send', { channelId: created.channel.id, content: 'não me perca' })
    await msg
    await a.socket.emitWithAck('account:update', { name: 'Nome Salvo' })
    a.socket.close()

    await server.restart()

    // sessão antiga continua válida
    const s = await server.connect(a.token)
    const hello = await s.emitWithAck('hello')
    expect(hello.account).toMatchObject({ id: a.account.id, name: 'Nome Salvo', tag: a.tag })
    expect(hello.state.channels.some((c) => c.id === created.channel.id)).toBe(true)
    const history = await s.emitWithAck('message:history', { channelId: created.channel.id })
    expect(history.messages.map((m) => m.content)).toEqual(['não me perca'])
    // o histórico junta o autor com a conta: mostra o nome atual, não o do envio
    expect(history.messages[0].author).toMatchObject({ accountId: a.account.id, name: 'Nome Salvo' })
    s.close()

    // senha continua funcionando
    const login = await server.login(a.email, a.password)
    expect(login.ok).toBe(true)

    // estado em memória (presença, voz) começa vazio
    expect(hello.state.voice).toEqual([])
    expect(hello.state.users.map((u) => u.id)).toEqual([hello.self.id])
  })

  it('canal apagado continua apagado depois de reiniciar', async () => {
    const a = await server.newUser()
    const created = await a.socket.emitWithAck('channel:create', { name: 'temporario', type: 'text' })
    if (!created.ok) throw new Error(created.error)
    const deleted = waitFor(a.socket, 'channel:deleted')
    a.socket.emit('channel:delete', created.channel.id)
    await deleted
    a.socket.close()

    await server.restart()

    const s = await server.connect(a.token)
    const hello = await s.emitWithAck('hello')
    expect(hello.state.channels.some((c) => c.id === created.channel.id)).toBe(false)
    s.close()
  })
})
