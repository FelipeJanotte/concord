import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Preferences } from '@shared/types'
import { DEFAULT_THEME } from '@shared/types'
import { bindPreferencesEvents } from '@/lib/actions/preferences'
import { bindPresenceEvents, idleEnv, setDoNotDisturb, syncActivityStatus } from '@/lib/actions/presence'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

let socket: FakeSocket
let idleListener: ((idle: boolean) => void) | null = null
let systemIdle = false

vi.spyOn(idleEnv, 'bridge').mockReturnValue({
  isIdle: async () => systemIdle,
  onChange: (fn) => {
    idleListener = fn
    return () => (idleListener = null)
  }
})

const prefs = (over: Partial<Preferences> = {}): Preferences => ({ theme: DEFAULT_THEME, savedThemes: [], mutedChannels: [], doNotDisturb: false, ...over })

beforeEach(() => {
  useApp.setState({ ...initialState })
  systemIdle = false
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindPresenceEvents(socket.asSocket())
  bindPreferencesEvents(socket.asSocket())
})

describe('status de quem está online', () => {
  it('presence:status atualiza o status da conta', () => {
    useApp.setState({ statuses: { 'acc-ana': 'online', 'acc-bia': 'online' } })
    socket.receive('presence:status', { accountId: 'acc-ana', status: 'idle' })
    socket.receive('presence:status', { accountId: 'acc-caio', status: 'dnd' })
    expect(useApp.getState().statuses).toEqual({ 'acc-ana': 'idle', 'acc-bia': 'online', 'acc-caio': 'dnd' })
  })
})

describe('ausente pelo sistema', () => {
  it('o computador parado ou mexido avisa o servidor', () => {
    idleListener?.(true)
    idleListener?.(false)
    expect(socket.sent('presence:set-status')).toEqual([['idle'], ['online']])
  })

  it('ao conectar já parado, avisa ausente; mexendo, não manda nada (o servidor já começa online)', async () => {
    await syncActivityStatus()
    expect(socket.sent('presence:set-status')).toEqual([])
    systemIdle = true
    await syncActivityStatus()
    expect(socket.sent('presence:set-status')).toEqual([['idle']])
  })
})

describe('Não perturbe', () => {
  it('liga na hora e salva nas preferências da conta', async () => {
    socket.replyTo('preferences:update', () => ({ ok: true, preferences: prefs({ doNotDisturb: true }) }))
    await setDoNotDisturb(true)
    expect(socket.sent('preferences:update')).toEqual([[{ doNotDisturb: true }]])
    expect(useApp.getState().doNotDisturb).toBe(true)
  })

  it('servidor recusou: volta como estava e avisa', async () => {
    socket.replyTo('preferences:update', () => ({ ok: false, error: 'Muitas alterações seguidas.' }))
    await setDoNotDisturb(true)
    expect(useApp.getState().doNotDisturb).toBe(false)
    expect(useApp.getState().notice?.text).toBe('Não foi possível mudar o Não perturbe: Muitas alterações seguidas.')
  })

  it('vem com as preferências da conta e acompanha as outras janelas', () => {
    socket.receive('preferences:updated', prefs({ doNotDisturb: true }))
    expect(useApp.getState().doNotDisturb).toBe(true)
  })
})
