// @vitest-environment jsdom
// Overlay em jogos no app (B15): o que vai para o overlay (minha sala), preferência salva e atalho.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OVERLAY_SHORTCUTS, type OverlayBridge, type OverlayConfig, type OverlayPosition, type OverlayRoom, type OverlayShortcuts } from '@shared/overlay'
import type { Channel, DmEntry, ThemeConfig, User, VoiceState } from '@shared/types'
import {
  cancelOverlayShortcutRecording,
  loadOverlayPreferences,
  OVERLAY_KEY,
  overlayEnv,
  overlayRoom,
  recordOverlayShortcutKey,
  resetOverlayShortcuts,
  setOverlayCorner,
  setOverlayEditing,
  setOverlayEnabled,
  setOverlaySize,
  startOverlay,
  startOverlayShortcutRecording,
  syncOverlay
} from '@/lib/actions/overlay'
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

const noopBridge = (): OverlayBridge => ({
  setConfig: () => {},
  setRoom: () => {},
  onToggled: () => () => {},
  setEditing: () => {},
  onEditing: () => () => {},
  onMoved: () => () => {},
  onResized: () => () => {},
  setShortcuts: async () => ({ toggle: true, edit: true }),
  pauseShortcuts: () => {},
  setTheme: () => {}
})

describe('overlayRoom', () => {
  it('fora de sala: null', () => {
    expect(overlayRoom(useApp.getState())).toBeNull()
  })

  it('só quem está falando na minha sala, com foto completa, mute e deafen', () => {
    useApp.setState({
      myVoiceChannelId: 'jogos',
      users: [user('s1', 'Ana', '/avatars/acc-s1?v=2'), user('s2', 'Bia'), user('s3', 'Caio')],
      voice: [vs('s1', 'jogos', { muted: true }), vs('s2', 'jogos', { deafened: true }), vs('s3', 'outra')],
      speaking: { s1: true, s3: true }
    })
    expect(overlayRoom(useApp.getState())).toEqual({
      members: [{ id: 's1', name: 'Ana', avatarUrl: 'http://srv:3001/avatars/acc-s1?v=2', color: '#123456', speaking: true, muted: true, deafened: false }],
      more: 0
    })
  })

  it('em sala sem ninguém falando: sala vazia (o overlay some)', () => {
    useApp.setState({ myVoiceChannelId: 'jogos', users: [user('s1', 'Ana')], voice: [vs('s1', 'jogos')], speaking: { s1: false } })
    expect(overlayRoom(useApp.getState())).toEqual({ members: [], more: 0 })
  })

  it('chamada privada (só as pessoas, sem nome da sala); mais de 12 falando vira "+N"', () => {
    const users = Array.from({ length: 15 }, (_, i) => user(`u${i}`, `P${i}`))
    useApp.setState({ myVoiceChannelId: 'dm-ana', users, voice: users.map((u) => vs(u.id, 'dm-ana')), speaking: Object.fromEntries(users.map((u) => [u.id, true])) })
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
    expect(JSON.parse(localStorage.getItem(OVERLAY_KEY)!)).toEqual({ enabled: true, corner: 'bottom-right', size: 'medium', position: null, width: null, shortcuts: DEFAULT_OVERLAY_SHORTCUTS })
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
      ...noopBridge(),
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
    expect(configs).toEqual([{ enabled: false, corner: 'top-left', size: 'medium', position: null, width: null }])
    expect(rooms).toEqual([null])

    useApp.setState({ myVoiceChannelId: 'jogos', users: [user('s1', 'Ana')], voice: [vs('s1', 'jogos')] })
    useApp.setState({ typing: {} }) // nada que o overlay mostra mudou
    syncOverlay()
    expect(rooms).toHaveLength(2)
    expect(rooms[1]).toEqual({ members: [], more: 0 })
    useApp.setState({ speaking: { s1: true } })
    expect(rooms.at(-1)?.members.map((m) => m.name)).toEqual(['Ana'])

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
      ...noopBridge(),
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

describe('redimensionar arrastando', () => {
  it('a largura solta no overlay é salva e volta na configuração; escolher um tamanho volta à largura dele', () => {
    const configs: OverlayConfig[] = []
    let onResized: ((width: number) => void) | null = null
    vi.spyOn(overlayEnv, 'bridge').mockReturnValue({
      ...noopBridge(),
      setConfig: (c) => configs.push(c),
      onResized: (fn) => {
        onResized = fn
        return () => (onResized = null)
      }
    })
    const stop = startOverlay()
    onResized!(410.6)
    expect(useApp.getState().overlayWidth).toBe(411)
    expect(JSON.parse(localStorage.getItem(OVERLAY_KEY)!).width).toBe(411)
    expect(configs.at(-1)?.width).toBe(411)
    onResized!(Number.NaN)
    expect(useApp.getState().overlayWidth).toBe(411)
    useApp.setState({ overlayWidth: null })
    loadOverlayPreferences()
    expect(useApp.getState().overlayWidth).toBe(411)
    setOverlaySize('large')
    expect(useApp.getState().overlayWidth).toBeNull()
    stop()
    expect(onResized).toBeNull()
  })
})

describe('atalhos escolhidos', () => {
  function shortcutBridge(status = { toggle: true, edit: true }) {
    const calls = { set: [] as OverlayShortcuts[], paused: [] as boolean[] }
    vi.spyOn(overlayEnv, 'bridge').mockReturnValue({
      ...noopBridge(),
      setShortcuts: async (s) => {
        calls.set.push(s)
        return status
      },
      pauseShortcuts: (p) => calls.paused.push(p)
    })
    return calls
  }
  const key = (code: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) => ({
    key: code,
    code,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...mods
  })

  it('ao abrir manda os atalhos salvos; atalho ocupado por outro programa fica marcado', async () => {
    localStorage.setItem(OVERLAY_KEY, JSON.stringify({ shortcuts: { toggle: 'Alt+1', edit: 'Alt+2' } }))
    const calls = shortcutBridge({ toggle: false, edit: true })
    const stop = startOverlay()
    expect(calls.set).toEqual([{ toggle: 'Alt+1', edit: 'Alt+2' }])
    await vi.waitFor(() => expect(useApp.getState().overlayShortcutTaken).toEqual(['toggle']))
    stop()
  })

  it('gravar: pausa os atalhos, espera a combinação, salva e registra a nova', async () => {
    const calls = shortcutBridge()
    startOverlayShortcutRecording('toggle')
    expect(useApp.getState().overlayRecording).toBe('toggle')
    expect(calls.paused).toEqual([true])
    recordOverlayShortcutKey(key('ShiftLeft', { shiftKey: true }))
    expect(useApp.getState().overlayRecording).toBe('toggle')
    recordOverlayShortcutKey(key('KeyO', { ctrlKey: true, shiftKey: true }))
    expect(useApp.getState()).toMatchObject({ overlayRecording: null, overlayShortcuts: { toggle: 'Ctrl+Shift+O', edit: DEFAULT_OVERLAY_SHORTCUTS.edit } })
    expect(JSON.parse(localStorage.getItem(OVERLAY_KEY)!).shortcuts.toggle).toBe('Ctrl+Shift+O')
    expect(calls.set.at(-1)).toEqual({ toggle: 'Ctrl+Shift+O', edit: DEFAULT_OVERLAY_SHORTCUTS.edit })
    await vi.waitFor(() => expect(useApp.getState().overlayShortcutTaken).toEqual([]))
  })

  it('Esc desiste e volta os atalhos de antes; a combinação do outro atalho é recusada', () => {
    const calls = shortcutBridge()
    startOverlayShortcutRecording('edit')
    recordOverlayShortcutKey(key('Escape'))
    expect(useApp.getState().overlayRecording).toBeNull()
    expect(calls.paused).toEqual([true, false])
    expect(calls.set).toEqual([])
    startOverlayShortcutRecording('edit')
    recordOverlayShortcutKey(key('Backquote', { shiftKey: true }))
    expect(useApp.getState().overlayRecording).toBe('edit')
    expect(useApp.getState().notice?.text).toBe('Esse atalho já liga e desliga a sobreposição.')
    cancelOverlayShortcutRecording()
    cancelOverlayShortcutRecording()
    expect(calls.paused).toEqual([true, false, true, false])
  })

  it('restaurar padrão volta os dois e registra', () => {
    const calls = shortcutBridge()
    useApp.setState({ overlayShortcuts: { toggle: 'Alt+1', edit: 'Alt+2' } })
    resetOverlayShortcuts()
    expect(useApp.getState().overlayShortcuts).toEqual(DEFAULT_OVERLAY_SHORTCUTS)
    expect(calls.set).toEqual([DEFAULT_OVERLAY_SHORTCUTS])
    expect(JSON.parse(localStorage.getItem(OVERLAY_KEY)!).shortcuts).toEqual(DEFAULT_OVERLAY_SHORTCUTS)
  })

  it('atalhos salvos inválidos voltam ao padrão', () => {
    localStorage.setItem(OVERLAY_KEY, JSON.stringify({ shortcuts: { toggle: 'O', edit: 42 } }))
    loadOverlayPreferences()
    expect(useApp.getState().overlayShortcuts).toEqual(DEFAULT_OVERLAY_SHORTCUTS)
  })
})

describe('tema ao vivo', () => {
  const claro: ThemeConfig = { base: 'claro', accent: '#ff0055', background: { stops: ['#ffffff'], angle: 180 }, intensity: 0 }

  it('manda o tema da conta quando ele chega e quando muda, uma vez só', () => {
    const themes: ThemeConfig[] = []
    vi.spyOn(overlayEnv, 'bridge').mockReturnValue({ ...noopBridge(), setTheme: (t) => themes.push(t) })
    const stop = startOverlay()
    expect(themes).toEqual([])
    useApp.setState({ theme: claro, preferencesLoaded: true })
    expect(themes).toEqual([claro])
    useApp.setState({ typing: {} })
    useApp.setState({ theme: { ...claro } })
    expect(themes).toHaveLength(1)
    useApp.setState({ theme: { ...claro, accent: '#00aa55' } })
    expect(themes.at(-1)?.accent).toBe('#00aa55')
    stop()
  })
})
