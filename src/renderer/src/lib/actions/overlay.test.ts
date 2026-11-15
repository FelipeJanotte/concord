// @vitest-environment jsdom
// Overlay em jogos no app (B15): o que vai para o overlay (minha sala), preferência salva e atalho.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OverlayConfig, OverlayPosition, OverlayRoom } from '@shared/overlay'
import type { Channel, DmEntry, User, VoiceState } from '@shared/types'
import { loadOverlayPreferences, OVERLAY_KEY, overlayEnv, overlayRoom, setOverlayCorner, setOverlayEditing, setOverlayEnabled, startOverlay, syncOverlay } from '@/lib/actions/overlay'
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
      members: [
        { id: 's1', name: 'Ana', avatarUrl: 'http://srv:3001/avatars/acc-s1?v=2', color: '#123456', speaking: true, muted: true, deafened: false },
        { id: 's2', name: 'Bia', avatarUrl: null, color: '#123456', speaking: false, muted: false, deafened: true }
      ],
      more: 0
    })
  })

  it('chamada privada (só as pessoas, sem nome da sala); mais de 12 pessoas vira "+N"', () => {
    const users = Array.from({ length: 15 }, (_, i) => user(`u${i}`, `P${i}`))
    useApp.setState({ myVoiceChannelId: 'dm-ana', users, voice: users.map((u) => vs(u.id, 'dm-ana')) })
    const room = overlayRoom(useApp.getState())!
    expect(room).not.toHaveProperty('channelName')
    expect(room.members).toHaveLength(12)
    expect(room.more).toBe(3)
  })
})

describe('preferência', () => {
  it('salva e lê de volta; valores estranhos voltam ao padrão', () => {
    setOverlayEnabled(true)
    setOverlayCorner('bottom-right')
    expect(JSON.parse(localStorage.getItem(OVERLAY_KEY)!)).toEqual({ enabled: true, corner: 'bottom-right', size: 'medium', position: null })
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
      },
      setEditing: () => {},
      onEditing: () => () => {},
      onMoved: () => () => {}
    })
    const stop = startOverlay()
    expect(configs).toEqual([{ enabled: false, corner: 'top-left', size: 'medium', position: null }])
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
    expect(() => setOverlayEditing(true)).not.toThrow()
    stop()
  })
})

describe('mover (como no Discord)', () => {
  function bridge() {
    const calls = { configs: [] as OverlayConfig[], editing: [] as boolean[] }
    let onEditing: ((e: boolean) => void) | null = null
    let onMoved: ((p: OverlayPosition) => void) | null = null
    vi.spyOn(overlayEnv, 'bridge').mockReturnValue({
      setConfig: (c) => calls.configs.push(c),
      setRoom: () => {},
      onToggled: () => () => {},
      setEditing: (e) => calls.editing.push(e),
      onEditing: (fn) => {
        onEditing = fn
        return () => (onEditing = null)
      },
      onMoved: (fn) => {
        onMoved = fn
        return () => (onMoved = null)
      }
    })
    return { calls, editing: (e: boolean) => onEditing?.(e), moved: (p: unknown) => onMoved?.(p as OverlayPosition), listening: () => !!onEditing && !!onMoved }
  }

  it('o botão manda a configuração atual antes de pedir o modo de mover', () => {
    const b = bridge()
    const stop = startOverlay()
    useApp.setState({ overlayEnabled: true })
    setOverlayEditing(true)
    expect(b.calls.configs.at(-1)?.enabled).toBe(true)
    expect(b.calls.editing).toEqual([true])
    setOverlayEditing(false)
    expect(b.calls.editing).toEqual([true, false])
    stop()
  })

  it('o modo de mover chega na store; soltar salva a posição; parar de ouvir limpa', () => {
    const b = bridge()
    const stop = startOverlay()
    b.editing(true)
    expect(useApp.getState().overlayEditing).toBe(true)
    b.moved({ x: 420.7, y: 99 })
    expect(useApp.getState().overlayPosition).toEqual({ x: 421, y: 99 })
    expect(JSON.parse(localStorage.getItem(OVERLAY_KEY)!).position).toEqual({ x: 421, y: 99 })
    expect(b.calls.configs.at(-1)?.position).toEqual({ x: 421, y: 99 })
    b.moved({ x: 'a', y: 1 }) // inválido: ignora
    expect(useApp.getState().overlayPosition).toEqual({ x: 421, y: 99 })
    stop()
    expect(b.listening()).toBe(false)
    expect(useApp.getState().overlayEditing).toBe(false)
  })

  it('escolher um canto volta para o canto; a posição volta depois de reabrir; posição ruim é ignorada', () => {
    useApp.setState({ overlayPosition: { x: 10, y: 20 } })
    setOverlayEnabled(true)
    useApp.setState({ overlayPosition: null })
    loadOverlayPreferences()
    expect(useApp.getState().overlayPosition).toEqual({ x: 10, y: 20 })
    setOverlayCorner('top-right')
    expect(useApp.getState().overlayPosition).toBeNull()
    expect(JSON.parse(localStorage.getItem(OVERLAY_KEY)!).position).toBeNull()
    localStorage.setItem(OVERLAY_KEY, '{"enabled":true,"position":{"x":"1","y":null}}')
    loadOverlayPreferences()
    expect(useApp.getState().overlayPosition).toBeNull()
  })
})
