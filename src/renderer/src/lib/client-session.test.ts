// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientToServerEvents } from '@shared/types'
import { FakeSocket } from '@/test/fake-socket'

type HelloResponse = Parameters<Parameters<ClientToServerEvents['hello']>[0]>[0]

let fake = new FakeSocket()
vi.mock('socket.io-client', () => ({ io: () => fake }))

const { cancelRestore, connect, disconnect, restoreSession } = await import('@/lib/client')
const { useApp } = await import('@/store')
const { TOKEN_KEY } = await import('@/lib/core')

const raw = (event: string, ...args: unknown[]): void => (fake.receive as (e: string, ...a: unknown[]) => void)(event, ...args)

function serverAccepts(state: Partial<HelloResponse['state']> = {}): void {
  raw('connect')
  const calls = fake.sent('hello')
  const [hello] = calls[calls.length - 1] as [(res: HelloResponse) => void]
  hello({
    self: { id: 's', accountId: 'me', name: 'Eu', tag: 'eu1', color: '#000', avatarUrl: null },
    account: {} as HelloResponse['account'],
    state: { channels: [], users: [], voice: [], access: { ownerAccountId: 'me', roles: [], members: [], overrides: [] }, statuses: {}, ...state }
  } as HelloResponse)
}

beforeEach(() => {
  fake = new FakeSocket()
  vi.useFakeTimers()
  localStorage.setItem(TOKEN_KEY, 'token-salvo')
})

afterEach(() => {
  disconnect()
  vi.useRealTimers()
  localStorage.clear()
})

describe('restoreSession', () => {
  it('servidor fora do ar ao abrir: mantém o token e o "Entrando..." e entra quando o servidor volta', async () => {
    const done = restoreSession()
    raw('connect_error', new Error('websocket error'))
    raw('connect_error', new Error('timeout'))
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-salvo')
    expect(useApp.getState()).toMatchObject({ restoring: true, self: null })
    serverAccepts()
    await done
    expect(useApp.getState()).toMatchObject({ restoring: false, status: 'connected' })
    expect(useApp.getState().self?.accountId).toBe('me')
  })

  it('erro do servidor (server_error) não apaga o token e tenta de novo sozinho', async () => {
    void restoreSession()
    raw('connect_error', new Error('server_error'))
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-salvo')
    expect(fake.connectCalls).toBe(0)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fake.connectCalls).toBe(1)
    expect(useApp.getState().restoring).toBe(true)
  })

  it('só "unauthorized" apaga o token e mostra o login', async () => {
    const done = restoreSession()
    raw('connect_error', new Error('unauthorized'))
    await done
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(useApp.getState()).toMatchObject({ restoring: false, self: null })
  })
})

describe('reconexão', () => {
  it('server_error durante a reconexão mantém a sessão e tenta de novo', async () => {
    const done = connect('http://localhost:3001', 'token-salvo')
    serverAccepts()
    await done
    raw('disconnect', 'transport close')
    raw('connect_error', new Error('server_error'))
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-salvo')
    expect(useApp.getState().self?.accountId).toBe('me')
    await vi.advanceTimersByTimeAsync(5000)
    expect(fake.connectCalls).toBe(1)
  })

  it('a retentativa manual não roda quando o próprio socket.io já vai reconectar', async () => {
    void restoreSession()
    fake.active = true
    raw('connect_error', new Error('websocket error'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(fake.connectCalls).toBe(0)
  })
})

describe('servidor de versão anterior', () => {
  it('hello sem statuses entra com os status vazios em vez de undefined', async () => {
    const done = connect('http://localhost:3001', 'token-salvo')
    serverAccepts({ statuses: undefined })
    await done
    expect(useApp.getState().statuses).toEqual({})
  })
})

describe('cancelRestore', () => {
  it('desiste de esperar o servidor: fecha a conexão e mostra o login sem apagar o token', async () => {
    void restoreSession()
    raw('connect_error', new Error('websocket error'))
    cancelRestore()
    expect(fake.connected).toBe(false)
    expect(useApp.getState()).toMatchObject({ restoring: false, status: 'disconnected' })
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-salvo')
  })
})
