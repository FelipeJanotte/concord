// connect(): depois do `hello`, o app carrega amizades e conversas (v3).
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientToServerEvents, DmEntry, FriendEntry } from '@shared/types'
import { FakeSocket } from '@/test/fake-socket'

type HelloResponse = Parameters<Parameters<ClientToServerEvents['hello']>[0]>[0]

const fake = new FakeSocket()
vi.mock('socket.io-client', () => ({ io: () => fake }))

const { connect, disconnect } = await import('@/lib/client')
const { useApp } = await import('@/store')

afterEach(() => disconnect())

const friend: FriendEntry = {
  account: { id: 'a', name: 'Ana', tag: 'ana1', color: '#000', avatarUrl: null },
  status: 'friend',
  since: 1,
  online: true
}
const dm: DmEntry = { channel: { id: 'c1', name: 'x'.repeat(32), type: 'dm', createdAt: 1 }, other: friend.account }

describe('connect', () => {
  it('pede friend:list e dm:list logo depois do hello e guarda as listas', async () => {
    fake.replyTo('friend:list', () => [friend])
    fake.replyTo('dm:list', () => [dm])
    const done = connect('http://localhost:3001', 'token')
    ;(fake.receive as (event: string) => void)('connect')
    const [hello] = fake.sent('hello')[0] as [(res: HelloResponse) => void]
    hello({
      self: { id: 's', accountId: 'me', name: 'Eu', tag: 'eu1', color: '#000', avatarUrl: null },
      account: {} as HelloResponse['account'],
      state: { channels: [], users: [], voice: [], access: { ownerAccountId: 'me', roles: [], members: [], overrides: [] } }
    } as HelloResponse)
    await done
    await vi.waitFor(() => expect(useApp.getState().friendsLoaded).toBe(true))
    expect(useApp.getState()).toMatchObject({ friends: [friend], dms: [dm] })
    expect(fake.sent('friend:list')).toHaveLength(1)
  })
})
