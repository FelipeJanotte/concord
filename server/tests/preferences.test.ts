// Preferências (v5) no servidor real: tema ativo, temas salvos e sincronia entre janelas da mesma conta.
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_THEME, type ThemeConfig } from '../../src/shared/types'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

let server: TestServer
const open: ClientSocket[] = []

beforeAll(async () => {
  server = await TestServer.start()
})

afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

afterAll(async () => {
  await server?.destroy()
})

async function user(): Promise<TestUser> {
  const u = await server.newUser()
  open.push(u.socket)
  return u
}

const sunset: ThemeConfig = { base: 'escuro', accent: '#F97316', background: { stops: ['#1f1235', '#ff5f6d'], angle: 160 }, intensity: 70 }

describe('preferências', () => {
  it('sem nada salvo, devolve o tema padrão', async () => {
    const a = await user()
    expect(await a.socket.emitWithAck('preferences:get')).toEqual({ theme: DEFAULT_THEME, savedThemes: [] })
  })

  it('salva o tema (normalizado), vale na outra janela na hora e volta depois de reiniciar', async () => {
    const a = await user()
    const otherWindow = await server.connect(a.token)
    open.push(otherWindow)
    await otherWindow.emitWithAck('hello')
    const b = await user()

    const synced = waitFor(otherWindow, 'preferences:updated')
    const notOthers = expectNoEvent(b.socket, 'preferences:updated')
    const notMe = expectNoEvent(a.socket, 'preferences:updated')
    const res = await a.socket.emitWithAck('preferences:update', { theme: sunset })
    const normalized = { ...sunset, accent: '#f97316' }
    expect(res).toEqual({ ok: true, preferences: { theme: normalized, savedThemes: [] } })
    expect((await synced)[0].theme).toEqual(normalized)
    await notOthers
    await notMe

    await server.restart()
    const again = await server.connect(a.token)
    open.push(again)
    await again.emitWithAck('hello')
    expect((await again.emitWithAck('preferences:get')).theme).toEqual(normalized)
  })

  it('temas salvos: até 10, com id, nome e tema válidos', async () => {
    const a = await user()
    const saved = [{ id: randomUUID(), name: '  Pôr do sol ', theme: sunset }]
    const res = await a.socket.emitWithAck('preferences:update', { savedThemes: saved })
    expect(res.ok && res.preferences.savedThemes).toEqual([{ id: saved[0].id, name: 'Pôr do sol', theme: { ...sunset, accent: '#f97316' } }])

    const many = Array.from({ length: 11 }, (_, i) => ({ id: randomUUID(), name: `T${i}`, theme: sunset }))
    expect((await a.socket.emitWithAck('preferences:update', { savedThemes: many })).ok).toBe(false)
    const dupId = randomUUID()
    expect(
      (await a.socket.emitWithAck('preferences:update', { savedThemes: [{ id: dupId, name: 'a', theme: sunset }, { id: dupId, name: 'b', theme: sunset }] })).ok
    ).toBe(false)
    expect((await a.socket.emitWithAck('preferences:update', { savedThemes: [{ id: 'x', name: 'a', theme: sunset }] })).ok).toBe(false)
    expect((await a.socket.emitWithAck('preferences:update', { savedThemes: [{ id: randomUUID(), name: '', theme: sunset }] })).ok).toBe(false)
  })

  it('recusa tema inválido e pedido vazio, sem mudar nada', async () => {
    const a = await user()
    expect(await a.socket.emitWithAck('preferences:update', { theme: { ...sunset, accent: 'laranja' } })).toEqual({
      ok: false,
      error: 'Tema inválido'
    })
    expect(await a.socket.emitWithAck('preferences:update', {})).toEqual({ ok: false, error: 'Nada para mudar' })
    expect((await a.socket.emitWithAck('preferences:get')).theme).toEqual(DEFAULT_THEME)
  })

  it('antes do hello não muda nada', async () => {
    const reg = await server.register({ email: `${randomUUID().slice(0, 8)}@t.com`, password: 'senha-forte-123', name: 'Sem Hello', tag: randomUUID().slice(0, 5).replace(/-/g, 'a') })
    if (!reg.ok) throw new Error(reg.error)
    const s = await server.connect(reg.token)
    open.push(s)
    expect(await s.emitWithAck('preferences:update', { theme: sunset })).toEqual({ ok: false, error: 'Não autenticado' })
  })
})
