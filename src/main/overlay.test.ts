// Overlay em jogos no processo principal (B15), sem Electron de verdade: posição, validação e quando a
// janela aparece/some (ligado + numa sala com gente), atalho e fechar.
import { describe, expect, it, vi } from 'vitest'
import type { OverlayRoom } from '../shared/overlay'

vi.mock('electron', () => ({ BrowserWindow: class {}, globalShortcut: {}, ipcMain: {}, screen: {} }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

const { cleanConfig, cleanRoom, createOverlayController, overlayBounds } = await import('./overlay')

const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
const member = (id: string, extra = {}) => ({ id, name: id, avatarUrl: null, color: '#fff', speaking: false, muted: false, deafened: false, ...extra })
const room = (n: number, more = 0): OverlayRoom => ({ channelName: 'Jogos', members: Array.from({ length: n }, (_, i) => member(`p${i}`)), more })

describe('overlayBounds', () => {
  it('cada canto com margem de 16 px; altura cresce com as pessoas', () => {
    const cfg = { enabled: true, size: 'medium' as const }
    expect(overlayBounds(workArea, { ...cfg, corner: 'top-left' }, 2)).toEqual({ x: 16, y: 16, width: 250, height: 8 * 2 + 26 + 38 * 2 })
    const br = overlayBounds(workArea, { ...cfg, corner: 'bottom-right' }, 2)
    expect([br.x + br.width, br.y + br.height]).toEqual([1920 - 16, 1040 - 16])
    expect(overlayBounds({ x: 100, y: 50, width: 800, height: 600 }, { ...cfg, corner: 'top-right' }, 1).x).toBe(100 + 800 - 250 - 16)
  })

  it('tamanhos diferentes e altura com teto', () => {
    const small = overlayBounds(workArea, { enabled: true, corner: 'top-left', size: 'small' }, 1)
    const large = overlayBounds(workArea, { enabled: true, corner: 'top-left', size: 'large' }, 1)
    expect([small.width, large.width]).toEqual([200, 320])
    const many = overlayBounds(workArea, { enabled: true, corner: 'top-left', size: 'small' }, 500)
    expect(many.height).toBe(8 * 2 + 22 + 30 * 13)
  })
})

describe('validação', () => {
  it('configuração desconhecida volta ao padrão', () => {
    expect(cleanConfig(null)).toEqual({ enabled: false, corner: 'top-left', size: 'medium' })
    expect(cleanConfig({ enabled: true, corner: 'meio', size: 'enorme' })).toEqual({ enabled: true, corner: 'top-left', size: 'medium' })
    expect(cleanConfig({ enabled: 'sim', corner: 'bottom-right', size: 'large' })).toEqual({ enabled: false, corner: 'bottom-right', size: 'large' })
  })

  it('sala: corta textos e pessoas, só aceita foto http/data', () => {
    expect(cleanRoom(null)).toBeNull()
    expect(cleanRoom({ channelName: 3, members: [] })).toBeNull()
    const r = cleanRoom({
      channelName: 'x'.repeat(100),
      members: [
        { id: 'a', name: 'n'.repeat(50), avatarUrl: 'javascript:alert(1)', color: '#fff', speaking: 'sim', muted: true },
        ...Array.from({ length: 20 }, (_, i) => member(`m${i}`, { avatarUrl: 'http://srv/a.png' }))
      ],
      more: -3
    })!
    expect(r.channelName).toHaveLength(64)
    expect(r.members).toHaveLength(12)
    expect(r.members[0]).toEqual({ id: 'a', name: 'n'.repeat(32), avatarUrl: null, color: '#fff', speaking: false, muted: true, deafened: false })
    expect(r.members[1].avatarUrl).toBe('http://srv/a.png')
    expect(r.more).toBe(0)
  })
})

function setup() {
  const win = {
    setBounds: vi.fn(),
    showInactive: vi.fn(() => (win.visible = true)),
    hide: vi.fn(() => (win.visible = false)),
    isVisible: () => win.visible,
    isDestroyed: () => win.destroyed,
    destroy: vi.fn(() => (win.destroyed = true)),
    send: vi.fn(),
    visible: false,
    destroyed: false
  }
  const deps = { createWindow: vi.fn(() => win), workArea: () => workArea, notifyToggled: vi.fn() }
  return { controller: createOverlayController(deps), deps, win }
}

describe('controlador', () => {
  it('só cria e mostra (sem roubar o foco) com o overlay ligado e numa sala com gente', () => {
    const { controller, deps, win } = setup()
    controller.setRoom(room(2))
    expect(deps.createWindow).not.toHaveBeenCalled()
    controller.setConfig({ enabled: true, corner: 'top-left', size: 'medium' })
    expect(deps.createWindow).toHaveBeenCalledTimes(1)
    expect(win.setBounds).toHaveBeenCalledWith(expect.objectContaining({ x: 16, y: 16, width: 250 }))
    expect(win.send).toHaveBeenLastCalledWith(room(2), { enabled: true, corner: 'top-left', size: 'medium' })
    expect(win.showInactive).toHaveBeenCalledTimes(1)
    controller.setRoom(room(3))
    expect(deps.createWindow).toHaveBeenCalledTimes(1)
    expect(win.showInactive).toHaveBeenCalledTimes(1)
    expect(controller.current().room?.members).toHaveLength(3)
  })

  it('sair da sala ou desligar esconde', () => {
    const { controller, win } = setup()
    controller.setConfig({ enabled: true, corner: 'top-left', size: 'small' })
    controller.setRoom(room(1))
    controller.setRoom(null)
    expect(win.hide).toHaveBeenCalledTimes(1)
    controller.setRoom(room(1))
    controller.setConfig({ enabled: false, corner: 'top-left', size: 'small' })
    expect(win.hide).toHaveBeenCalledTimes(2)
  })

  it('"+N" conta como mais uma linha na altura', () => {
    const { controller, win } = setup()
    controller.setConfig({ enabled: true, corner: 'top-left', size: 'small' })
    controller.setRoom(room(2, 5))
    expect(win.setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ height: 8 * 2 + 22 + 30 * 3 }))
  })

  it('atalho liga/desliga, avisa a janela principal; fechar destrói e recria se precisar', () => {
    const { controller, deps, win } = setup()
    controller.setRoom(room(1))
    controller.toggle()
    expect(deps.notifyToggled).toHaveBeenLastCalledWith(true)
    expect(win.showInactive).toHaveBeenCalled()
    controller.toggle()
    expect(deps.notifyToggled).toHaveBeenLastCalledWith(false)
    expect(win.hide).toHaveBeenCalled()
    controller.destroy()
    expect(win.destroy).toHaveBeenCalled()
    controller.toggle()
    expect(deps.createWindow).toHaveBeenCalledTimes(2)
  })
})
