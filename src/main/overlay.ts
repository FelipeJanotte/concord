/**
 * Sobreposição em jogos (overlay, B15): janela transparente, sem borda, sempre no topo
 * (`'screen-saver'`), que não recebe foco nem cliques (o clique passa para o jogo) e mostra quem
 * está na minha sala de voz e quem está falando. Aparece só com o overlay ligado e eu numa sala.
 *
 * Funciona por cima de jogos em janela e em tela cheia sem bordas; em tela cheia exclusiva uma
 * janela comum não aparece por cima (o Discord injeta código no jogo; fora de propósito).
 *
 * `createOverlayController` tem a lógica (testável com dependências falsas); `setupOverlay` liga
 * ao Electron (IPC `overlay-config`/`overlay-room`, atalho global, janela de verdade).
 */
import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import {
  DEFAULT_OVERLAY_CONFIG,
  OVERLAY_CORNERS,
  OVERLAY_MAX_MEMBERS,
  OVERLAY_SHORTCUT,
  OVERLAY_SIZES,
  type OverlayConfig,
  type OverlayRoom,
  type OverlaySize
} from '../shared/overlay'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Medidas por tamanho: largura, altura de cada pessoa e da linha do nome da sala. */
const SIZES: Record<OverlaySize, { width: number; row: number; header: number }> = {
  small: { width: 200, row: 30, header: 22 },
  medium: { width: 250, row: 38, header: 26 },
  large: { width: 320, row: 48, header: 30 }
}
const MARGIN = 16
const PADDING = 8

/** Onde a janela fica: no canto escolhido da área útil da tela, com altura para as pessoas. */
export function overlayBounds(workArea: Rect, config: OverlayConfig, rows: number): Rect {
  const s = SIZES[config.size]
  const width = s.width
  const height = PADDING * 2 + s.header + s.row * Math.max(1, Math.min(rows, OVERLAY_MAX_MEMBERS + 1))
  const right = config.corner.endsWith('right')
  const bottom = config.corner.startsWith('bottom')
  return {
    x: Math.round(right ? workArea.x + workArea.width - width - MARGIN : workArea.x + MARGIN),
    y: Math.round(bottom ? workArea.y + workArea.height - height - MARGIN : workArea.y + MARGIN),
    width,
    height
  }
}

/** Confere a configuração vinda do renderer (valores desconhecidos voltam ao padrão). */
export function cleanConfig(raw: unknown): OverlayConfig {
  const c = raw as Partial<OverlayConfig> | null
  return {
    enabled: c?.enabled === true,
    corner: OVERLAY_CORNERS.includes(c?.corner as never) ? (c!.corner as OverlayConfig['corner']) : DEFAULT_OVERLAY_CONFIG.corner,
    size: OVERLAY_SIZES.includes(c?.size as never) ? (c!.size as OverlaySize) : DEFAULT_OVERLAY_CONFIG.size
  }
}

/** Confere o estado da sala (texto curto, no máximo `OVERLAY_MAX_MEMBERS` pessoas); inválido = null. */
export function cleanRoom(raw: unknown): OverlayRoom | null {
  const r = raw as Partial<OverlayRoom> | null
  if (!r || typeof r.channelName !== 'string' || !Array.isArray(r.members)) return null
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
  const members = r.members.slice(0, OVERLAY_MAX_MEMBERS).map((m) => ({
    id: str(m?.id, 64),
    name: str(m?.name, 32),
    avatarUrl: typeof m?.avatarUrl === 'string' && /^(https?:|data:)/.test(m.avatarUrl) ? m.avatarUrl.slice(0, 2048) : null,
    color: str(m?.color, 16),
    speaking: m?.speaking === true,
    muted: m?.muted === true,
    deafened: m?.deafened === true
  }))
  const more = typeof r.more === 'number' && r.more > 0 ? Math.floor(r.more) : 0
  return { channelName: str(r.channelName, 64), members, more }
}

/** O que o controlador precisa do mundo de fora (janela, tela, aviso para a janela principal). */
export interface OverlayDeps {
  /** cria a janela do overlay (escondida) */
  createWindow: () => OverlayWindow
  workArea: () => Rect
  /** o atalho mudou o "ligado": avisa a janela principal para salvar */
  notifyToggled: (enabled: boolean) => void
}

export interface OverlayWindow {
  setBounds: (rect: Rect) => void
  showInactive: () => void
  hide: () => void
  isVisible: () => boolean
  isDestroyed: () => boolean
  destroy: () => void
  send: (room: OverlayRoom | null, config: OverlayConfig) => void
}

export function createOverlayController(deps: OverlayDeps) {
  let config: OverlayConfig = { ...DEFAULT_OVERLAY_CONFIG }
  let room: OverlayRoom | null = null
  let win: OverlayWindow | null = null

  function update(): void {
    const visible = config.enabled && !!room && room.members.length > 0
    if (!visible) {
      if (win && !win.isDestroyed() && win.isVisible()) win.hide()
      return
    }
    if (!win || win.isDestroyed()) win = deps.createWindow()
    win.setBounds(overlayBounds(deps.workArea(), config, room!.members.length + (room!.more > 0 ? 1 : 0)))
    win.send(room, config)
    if (!win.isVisible()) win.showInactive()
  }

  return {
    setConfig(raw: unknown): void {
      config = cleanConfig(raw)
      update()
    },
    setRoom(raw: unknown): void {
      room = cleanRoom(raw)
      update()
    },
    /** atalho global: liga/desliga e avisa a janela principal */
    toggle(): void {
      config = { ...config, enabled: !config.enabled }
      deps.notifyToggled(config.enabled)
      update()
    },
    /** o que a página do overlay precisa ao terminar de carregar */
    current(): { room: OverlayRoom | null; config: OverlayConfig } {
      return { room, config }
    },
    destroy(): void {
      if (win && !win.isDestroyed()) win.destroy()
      win = null
    }
  }
}

export type OverlayController = ReturnType<typeof createOverlayController>

function createOverlayWindow(getController: () => OverlayController): OverlayWindow {
  const win = new BrowserWindow({
    width: 250,
    height: 100,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    title: 'Concord overlay',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  const send = (room: OverlayRoom | null, config: OverlayConfig): void => {
    if (!win.isDestroyed()) win.webContents.send('overlay-update', room, config)
  }
  // a página acabou de carregar: manda o estado atual
  win.webContents.on('did-finish-load', () => {
    const { room, config } = getController().current()
    send(room, config)
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  else void win.loadFile(join(__dirname, '../renderer/overlay.html'))
  return {
    setBounds: (rect) => win.setBounds(rect),
    showInactive: () => win.showInactive(),
    hide: () => win.hide(),
    isVisible: () => win.isVisible(),
    isDestroyed: () => win.isDestroyed(),
    destroy: () => win.destroy(),
    send
  }
}

/** Liga o overlay ao Electron. Devolve o controlador (o `main` destrói a janela ao fechar o app). */
export function setupOverlay(getMainWindow: () => BrowserWindow | null): OverlayController {
  const controller: OverlayController = createOverlayController({
    createWindow: () => createOverlayWindow(() => controller),
    workArea: () => screen.getPrimaryDisplay().workArea,
    notifyToggled: (enabled) => getMainWindow()?.webContents.send('overlay-toggled', enabled)
  })
  ipcMain.on('overlay-config', (_event, raw: unknown) => controller.setConfig(raw))
  ipcMain.on('overlay-room', (_event, raw: unknown) => controller.setRoom(raw))
  // atalho global (funciona com o jogo em primeiro plano); se outro programa já usa, fica só o interruptor
  if (!globalShortcut.register(OVERLAY_SHORTCUT, () => controller.toggle())) {
    console.warn(`[overlay] atalho ${OVERLAY_SHORTCUT} já está em uso por outro programa`)
  }
  return controller
}

/** Solta o atalho global (chamado ao sair do app). */
export function teardownOverlay(): void {
  globalShortcut.unregister(OVERLAY_SHORTCUT)
}
