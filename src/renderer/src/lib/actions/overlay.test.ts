// @vitest-environment jsdom
// Overlay em jogos no app (B15): o que vai para o overlay (minha sala), preferência salva e atalho.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OverlayConfig, OverlayRoom } from '@shared/overlay'
import type { Channel, DmEntry, User, VoiceState } from '@shared/types'
import { loadOverlayPreferences, OVERLAY_KEY, overlayEnv, overlayRoom, setOverlayCorner, setOverlayEnabled, startOverlay, syncOverlay } from '@/lib/actions/overlay'
import { initialState, useApp } from '@/store'

const user = (id: string, name: string, avatarUrl: string | null = null): User => ({ id, accountId: `acc-${id}`, name, tag: id, color: '#123456', avatarUrl })
const vs = (userId: string, channelId: string, extra: Partial<VoiceState> = {}): VoiceState => ({ userId, channelId, muted: false, deafened: false, sharing: false, ...extra })
const jogos: Channel = { id: 'jogos', name: 'Jogos', type: 'voice', createdAt: 0 }
const dm: DmEntry = { channel: { id: 'dm-ana', name: 'dm', type: 'dm', createdAt: 0 }, other: { id: 'acc-ana', name: 'Ana', tag: 'a', color: '#fff', avatarUrl: null } }

beforeEach(() => {
  localStorage.clear()
  useApp.setState({ ...initialState, serverUrl: 'http://srv:3001', channels: [jogos], dms: [dm] })
})
afterEach(() => vi.restoreAllMocks())

describe('overlayRoom', () => {
  it('fora de sala: null', () => {
    expect(overlayRoom(useApp.getState())).toBeNull()
  })

  it('pessoas da minha sala com foto completa, quem fala, mute e deafen', () => {
    useApp.setState({
      myVoiceChannelId: 'jogos',
      users: [user('s1', 'Ana', '/avatars/acc-s1?v=2'), user('s2', 'Bia')],
      voice: [vs('s1', 'jogos', { muted: true }), vs('s2', 'jogos', { deafened: true }), vs('s3', 'outra')],
      speaking: { s1: true }
    })
    expect(overlayRoom(useApp.getState())).toEqual({
      channelName: 'Jogos',
      members: [
        { id: 's1', name: 'Ana', avatarUrl: 'http://srv:3001/avatars/acc-s1?v=2', color: '#123456', speaking: true, muted: true, deafened: false },
        { id: 's2', name: 'Bia', avatarUrl: null, color: '#123456', speaking: false, muted: false, deafened: true }
      ],
      more: 0
    })
  })

  it('chamada privada mostra com quem; mais de 12 pessoas vira "+N"', () => {
    const users = Array.from({ length: 15 }, (_, i) => user(`u${i}`, `P${i}`))
    useApp.setState({ myVoiceChannelId: 'dm-ana', users, voice: users.map((u) => vs(u.id, 'dm-ana')) })
    const room = overlayRoom(useApp.getState())!
    expect(room.channelName).toBe('Chamada com Ana')
    expect(room.members).toHaveLength(12)
    expect(room.more).toBe(3)
  })
})

describe('preferência', () => {
  it('salva e lê de volta; valores estranhos voltam ao padrão', () => {
    setOverlayEnabled(true)
    setOverlayCorner('bottom-right')
    expect(JSON.parse(localStorage.getItem(OVERLAY_KEY)!)).toEqual({ enabled: true, corner: 'bottom-right', size: 'medium' })
    useApp.setState({ ...initialState })
    loadOverlayPreferences()
    expect(useApp.getState()).toMatchObject({ overlayEnabled: true, overlayCorner: 'bottom-right' })
    localStorage.setItem(OVERLAY_KEY, '{"enabled":"x","corner":"meio","size":"gigante"}')
    loadOverlayPreferences()
    expect(useApp.getState()).toMatchObject({ overlayEnabled: false, overlayCorner: 'top-left', overlaySize: 'medium' })
    localStorage.setItem(OVERLAY_KEY, 'não é json')
    expect(() => loadOverlayPreferences()).not.toThrow()
  })
})

describe('sincronia com o processo principal', () => {
  it('manda configuração e sala só quando mudam; o atalho vira preferência salva', () => {
    const configs: OverlayConfig[] = []
    const rooms: Array<OverlayRoom | null> = []
    let toggled: ((enabled: boolean) => void) | null = null
    vi.spyOn(overlayEnv, 'bridge').mockReturnValue({
      setConfig: (c) => configs.push(c),
      setRoom: (r) => rooms.push(r),
      onToggled: (fn) => {
        toggled = fn
        return () => (toggled = null)
      }
    })
    const stop = startOverlay()
    expect(configs).toEqual([{ enabled: false, corner: 'top-left', size: 'medium' }])
    expect(rooms).toEqual([null])

    useApp.setState({ myVoiceChannelId: 'jogos', users: [user('s1', 'Ana')], voice: [vs('s1', 'jogos')] })
    useApp.setState({ typing: {} }) // nada que o overlay mostra mudou
    syncOverlay()
    expect(rooms).toHaveLength(2)
    expect(rooms[1]?.members.map((m) => m.name)).toEqual(['Ana'])
    useApp.setState({ speaking: { s1: true } })
    expect(rooms.at(-1)?.members[0].speaking).toBe(true)

    toggled!(true)
    expect(useApp.getState().overlayEnabled).toBe(true)
    expect(configs.at(-1)?.enabled).toBe(true)
    expect(JSON.parse(localStorage.getItem(OVERLAY_KEY)!).enabled).toBe(true)

    stop()
    expect(toggled).toBeNull()
    useApp.setState({ myVoiceChannelId: null })
    expect(rooms.at(-1)).not.toBeNull()
  })

  it('fora do Electron (sem ponte) não quebra', () => {
    vi.spyOn(overlayEnv, 'bridge').mockReturnValue(null)
    const stop = startOverlay()
    expect(() => syncOverlay()).not.toThrow()
    stop()
  })
})
