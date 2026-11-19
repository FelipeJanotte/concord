import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AppServer } from '../context'
import { openTestDatabase } from '../tests/database'
import { sleep } from '../tests/helpers'
import { insertAccount } from '../repo/accounts'
import { listServerTimeouts, setServerTimeout } from '../repo/moderation'
import { activeTimeouts, isTimedOut, onTimeoutsChange, setTimedOut, timeoutRefusal, timeoutsModule } from './timeouts'

let cleanup: () => Promise<void>
beforeAll(async () => {
  cleanup = await openTestDatabase()
})
afterAll(async () => {
  await cleanup?.()
})

function fakeIo(): { io: AppServer; events: { accountId: string; until: number | null }[] } {
  const events: { accountId: string; until: number | null }[] = []
  const io = { emit: (_event: string, payload: { accountId: string; until: number | null }) => events.push(payload) }
  return { io: io as unknown as AppServer, events }
}

async function account(): Promise<string> {
  const id = randomUUID()
  await insertAccount({
    id,
    email: `castigo-${id.slice(0, 8)}@teste.com`,
    name: 'Castigo',
    tag: `c${id.slice(0, 8)}`,
    tagLocked: true,
    color: '#5865f2',
    passwordHash: null,
    googleId: null,
    avatarType: null,
    avatarVersion: 0,
    createdAt: Date.now()
  })
  return id
}

const stored = async (accountId: string): Promise<boolean> => (await listServerTimeouts()).some((t) => t.accountId === accountId)

describe('castigo no servidor', () => {
  it('acaba sozinho no prazo: some da memória e do banco, avisa todos e quem ouve as mudanças', async () => {
    const { io, events } = fakeIo()
    const ana = await account()
    let changes = 0
    onTimeoutsChange(() => changes++)
    await setTimedOut(io, ana, Date.now() + 100)
    expect(isTimedOut(ana)).toBe(true)
    expect(timeoutRefusal(ana)).toMatch(/^Você está de castigo até/)
    expect(await stored(ana)).toBe(true)
    await sleep(400)
    expect(isTimedOut(ana)).toBe(false)
    expect(timeoutRefusal(ana)).toBeNull()
    expect(await stored(ana)).toBe(false)
    expect(events.filter((e) => e.accountId === ana).map((e) => e.until === null)).toEqual([false, true])
    expect(changes).toBe(2)
  })

  it('trocar o prazo troca o fim: o prazo antigo não tira o castigo novo', async () => {
    const { io } = fakeIo()
    const ana = await account()
    await setTimedOut(io, ana, Date.now() + 100)
    await setTimedOut(io, ana, Date.now() + 60_000)
    await sleep(300)
    expect(isTimedOut(ana)).toBe(true)
    await setTimedOut(io, ana, null)
    expect(isTimedOut(ana)).toBe(false)
  })

  it('ao subir carrega os castigos que ainda valem e apaga os vencidos', async () => {
    const { io } = fakeIo()
    const valendo = await account()
    const vencido = await account()
    await setServerTimeout(valendo, Date.now() + 60_000)
    await setServerTimeout(vencido, Date.now() - 1_000)
    await timeoutsModule.init!(io)
    expect(activeTimeouts().map((t) => t.accountId)).toContain(valendo)
    expect(isTimedOut(vencido)).toBe(false)
    expect(await stored(vencido)).toBe(false)
    await setTimedOut(io, valendo, null)
  })
})
