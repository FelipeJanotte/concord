// Overlay em jogos no processo principal (B15), sem Electron de verdade: posição, validação e quando a
// janela aparece/some (ligado + numa sala com gente), atalho e fechar.
import { describe, expect, it, vi } from 'vitest'
import { OVERLAY_GAP, OVERLAY_METRICS, OVERLAY_PADDING, overlayHeight, type OverlayRoom } from '../shared/overlay'

vi.mock('electron', () => ({ BrowserWindow: class {}, globalShortcut: {}, ipcMain: {}, screen: {} }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

const { cleanConfig, cleanPosition, cleanRoom, createOverlayController, overlayBounds } = await import('./overlay')

const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
const member = (id: string, extra = {}) => ({ id, name: id, avatarUrl: null, color: '#fff', speaking: false, muted: false, deafened: false, ...extra })
const room = (n: number, more = 0): OverlayRoom => ({ members: Array.from({ length: n }, (_, i) => member(`p${i}`)), more })

describe('overlayBounds', () => {
  it('cada canto com margem de 16 px; altura cresce com as pessoas', () => {
    const cfg = { enabled: true, size: 'medium' as const, position: null }
    expect(overlayBounds(workArea, { ...cfg, corner: 'top-left' }, 2)).toEqual({ x: 16, y: 16, width: 250, height: 8 * 2 + 34 * 2 + 4 })
    const br = overlayBounds(workArea, { ...cfg, corner: 'bottom-right' }, 2)
    expect([br.x + br.width, br.y + br.height]).toEqual([1920 - 16, 1040 - 16])
    expect(overlayBounds({ x: 100, y: 50, width: 800, height: 600 }, { ...cfg, corner: 'top-right' }, 1).x).toBe(100 + 800 - 250 - 16)
  })

  it('tamanhos diferentes e altura com teto', () => {
    const small = overlayBounds(workArea, { enabled: true, corner: 'top-left', size: 'small', position: null }, 1)
    const large = overlayBounds(workArea, { enabled: true, corner: 'top-left', size: 'large', position: null }, 1)
    expect([small.width, large.width]).toEqual([200, 320])
    const many = overlayBounds(workArea, { enabled: true, corner: 'top-left', size: 'small', position: null }, 500)
    expect(many.height).toBe(8 * 2 + 26 * 13 + 4 * 12) // 12 pessoas + "+N"
  })

  it('altura exata das linhas da página (sem cortar a última): margem + linhas + espaços, sem linha do nome da sala', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const { line } = OVERLAY_METRICS[size]
      for (const n of [1, 2, 5]) {
        const b = overlayBounds(workArea, { enabled: true, corner: 'top-left', size, position: null }, n)
        expect(b.height).toBe(OVERLAY_PADDING * 2 + n * line + (n - 1) * OVERLAY_GAP)
        expect(b.height).toBe(overlayHeight(size, n))
      }
    }
    // a foto cabe na linha com folga para o anel de quem fala (2 px de cada lado)
    for (const { line, avatar } of Object.values(OVERLAY_METRICS)) expect(line - avatar).toBeGreaterThanOrEqual(4)
    // modo de mover: mais uma linha (a barra "Concluir")
    const cfg = { enabled: true, corner: 'top-left' as const, size: 'medium' as const, position: null }
    expect(overlayBounds(workArea, cfg, 2, true).height).toBe(overlayHeight('medium', 3))
  })
})

describe('validação', () => {
  it('configuração desconhecida volta ao padrão', () => {
    expect(cleanConfig(null)).toEqual({ enabled: false, corner: 'top-left', size: 'medium', position: null })
    expect(cleanConfig({ enabled: true, corner: 'meio', size: 'enorme' })).toEqual({ enabled: true, corner: 'top-left', size: 'medium', position: null })
    expect(cleanConfig({ enabled: 'sim', corner: 'bottom-right', size: 'large' })).toEqual({ enabled: false, corner: 'bottom-right', size: 'large', position: null })
  })

  it('sala: corta textos e pessoas, só aceita foto http/data', () => {
    expect(cleanRoom(null)).toBeNull()
    expect(cleanRoom({ members: 'nada' })).toBeNull()
    const r = cleanRoom({
      channelName: 'Jogos', // app antigo: o nome da sala é ignorado (não aparece mais)
      members: [
        { id: 'a', name: 'n'.repeat(50), avatarUrl: 'javascript:alert(1)', color: '#fff', speaking: 'sim', muted: true },
        ...Array.from({ length: 20 }, (_, i) => member(`m${i}`, { avatarUrl: 'http://srv/a.png' }))
      ],
      more: -3
    })!
    expect(r).not.toHaveProperty('channelName')
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
    setInteractive: vi.fn(),
    visible: false,
    destroyed: false
  }
  const deps = { createWindow: vi.fn(() => win), workArea: vi.fn((_p?: unknown) => workArea), notifyToggled: vi.fn(), notifyEditing: vi.fn(), notifyMoved: vi.fn() }
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
    expect(win.send).toHaveBeenLastCalledWith(room(2), { enabled: true, corner: 'top-left', size: 'medium', position: null }, false)
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
    // 2 pessoas + "+N" = 3 linhas
    expect(win.setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ height: overlayHeight('small', 3) }))
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

describe('posição arrastada', () => {
  const at = (x: number, y: number) => ({ enabled: true, corner: 'bottom-right' as const, size: 'medium' as const, position: { x, y } })

  it('vale no lugar do canto e não sai da área útil da tela', () => {
    expect(overlayBounds(workArea, at(500, 300), 2)).toMatchObject({ x: 500, y: 300, width: 250 })
    const off = overlayBounds(workArea, at(5000, -40), 2)
    expect([off.x + off.width, off.y]).toEqual([1920, 0])
    // outra tela (à esquerda da principal)
    expect(overlayBounds({ x: -1280, y: 0, width: 1280, height: 1000 }, at(-900, 100), 1)).toMatchObject({ x: -900, y: 100 })
  })

  it('o modo de mover ganha uma linha de altura para a barra "Concluir"', () => {
    const cfg = { enabled: true, corner: 'top-left' as const, size: 'medium' as const, position: null }
    expect(overlayBounds(workArea, cfg, 2, true).height - overlayBounds(workArea, cfg, 2).height).toBe(34 + 4)
  })

  it('validação: só números finitos, arredondados', () => {
    expect(cleanPosition({ x: 10.6, y: -3.2 })).toEqual({ x: 11, y: -3 })
    expect(cleanPosition({ x: '1', y: 2 })).toBeNull()
    expect(cleanPosition({ x: Number.NaN, y: 2 })).toBeNull()
    expect(cleanPosition({ x: 1e9, y: 2 })).toBeNull()
    expect(cleanPosition(null)).toBeNull()
    expect(cleanConfig({ enabled: true, position: { x: 1, y: 2 } }).position).toEqual({ x: 1, y: 2 })
  })

  it('usa a área útil da tela onde está a posição', () => {
    const { controller, deps } = setup()
    controller.setRoom(room(1))
    controller.setConfig(at(-900, 100))
    expect(deps.workArea).toHaveBeenLastCalledWith({ x: -900, y: 100 })
  })
})

describe('modo de mover', () => {
  const on = { enabled: true, corner: 'top-left' as const, size: 'medium' as const, position: null }

  it('destrava a janela (recebe o mouse), avisa a janela principal e manda o modo para a página', () => {
    const { controller, deps, win } = setup()
    controller.setConfig(on)
    controller.setRoom(room(2))
    controller.setEditing(true)
    expect(win.setInteractive).toHaveBeenLastCalledWith(true)
    expect(deps.notifyEditing).toHaveBeenLastCalledWith(true)
    expect(win.send).toHaveBeenLastCalledWith(room(2), on, true)
    expect(controller.current().editing).toBe(true)
    controller.setEditing(false)
    expect(win.setInteractive).toHaveBeenLastCalledWith(false)
    expect(deps.notifyEditing).toHaveBeenLastCalledWith(false)
  })

  it('aparece fora de sala (prévia) enquanto move, e some ao concluir', () => {
    const { controller, deps, win } = setup()
    controller.setConfig(on)
    expect(deps.createWindow).not.toHaveBeenCalled()
    controller.setEditing(true)
    expect(win.showInactive).toHaveBeenCalled()
    expect(win.send).toHaveBeenLastCalledWith(null, on, true)
    controller.setEditing(false)
    expect(win.hide).toHaveBeenCalled()
  })

  it('com o overlay desligado o botão não destrava; desligar no meio trava de novo', () => {
    const { controller, deps } = setup()
    controller.setEditing(true)
    expect(deps.notifyEditing).not.toHaveBeenCalled()
    controller.setConfig(on)
    controller.setEditing(true)
    controller.setConfig({ ...on, enabled: false })
    expect(deps.notifyEditing).toHaveBeenLastCalledWith(false)
    controller.setConfig(on)
    controller.setEditing(true)
    controller.toggle() // atalho de ligar/desligar
    expect(deps.notifyEditing).toHaveBeenLastCalledWith(false)
    expect(controller.current().editing).toBe(false)
  })

  it('atalho do modo de mover: liga o overlay se estava desligado e alterna', () => {
    const { controller, deps } = setup()
    controller.toggleEditing()
    expect(deps.notifyToggled).toHaveBeenLastCalledWith(true)
    expect(controller.current()).toMatchObject({ editing: true, config: { enabled: true } })
    controller.toggleEditing()
    expect(controller.current().editing).toBe(false)
    expect(deps.notifyToggled).toHaveBeenCalledTimes(1)
  })

  it('soltar a janela guarda a posição e avisa a janela principal; fora do modo de mover é ignorado', () => {
    const { controller, deps } = setup()
    controller.setConfig(on)
    controller.setRoom(room(1))
    controller.moved({ x: 300, y: 200, width: 250, height: 100 }) // setBounds do próprio app
    expect(deps.notifyMoved).not.toHaveBeenCalled()
    controller.setEditing(true)
    controller.moved({ x: 300.4, y: 200, width: 250, height: 100 })
    expect(deps.notifyMoved).toHaveBeenLastCalledWith({ x: 300, y: 200 })
    expect(controller.current().config.position).toEqual({ x: 300, y: 200 })
  })
})
