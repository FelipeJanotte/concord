/**
 * Pressione para falar (push-to-talk, B20), lado do processo principal.
 *
 * O `globalShortcut` do Electron só avisa quando o atalho é pressionado, nunca quando é solto,
 * então a escuta usa o `uiohook-napi` (MIT, binários prontos via N-API): um gancho de teclado e
 * mouse do sistema inteiro, que funciona com o jogo em primeiro plano. O gancho **só roda com o
 * modo ligado** (ou enquanto a pessoa escolhe a tecla) e só compara a tecla escolhida: nenhuma
 * outra tecla sai do processo principal.
 *
 * `createPushToTalkController` tem a lógica (testável com gancho e relógio falsos);
 * `setupPushToTalk` liga ao Electron (IPC `ptt-config`/`ptt-capture`, avisos `ptt-change`/`ptt-unavailable`).
 * Skill `concord-voice` (seção "Pressione para falar").
 */
import { ipcMain, type BrowserWindow } from 'electron'
import {
  cleanPttConfig,
  PTT_CAPTURE_TIMEOUT_MS,
  PTT_MOUSE_BUTTONS,
  PTT_RELEASE_DELAY_MS,
  type PttBinding,
  type PttConfig
} from '../shared/push-to-talk'

/** Um evento do gancho, já traduzido: tecla ou botão do mouse, pressionado ou solto. */
export interface HookEvent {
  kind: 'key' | 'mouse'
  code: number
  down: boolean
}

export interface PttHook {
  start: () => void
  stop: () => void
}

export interface PttDeps {
  /** cria o gancho do sistema; null = biblioteca nativa indisponível */
  createHook: (listener: (event: HookEvent) => void) => PttHook | null
  /** nome da tecla para a tela */
  keyLabel: (code: number) => string
  send: (pressed: boolean) => void
  notifyUnavailable: () => void
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}

/** Código do Esc no uiohook: durante a escolha da tecla, desiste. */
const ESCAPE = 1

const MOUSE_LABELS: Record<number, string> = { 3: 'Botão do meio do mouse', 4: 'Botão 4 do mouse', 5: 'Botão 5 do mouse' }

/** Nomes em português para as teclas que não são uma letra ou número. */
const KEY_NAMES: Record<string, string> = {
  Space: 'Espaço',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Tab: 'Tab',
  CapsLock: 'Caps Lock',
  Ctrl: 'Ctrl',
  CtrlRight: 'Ctrl direito',
  Alt: 'Alt',
  AltRight: 'Alt Gr',
  Shift: 'Shift',
  ShiftRight: 'Shift direito',
  Meta: 'Windows',
  MetaRight: 'Windows direito',
  ArrowUp: 'Seta para cima',
  ArrowDown: 'Seta para baixo',
  ArrowLeft: 'Seta para a esquerda',
  ArrowRight: 'Seta para a direita',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  PrintScreen: 'Print Screen',
  ScrollLock: 'Scroll Lock',
  NumLock: 'Num Lock'
}

/** Nome da tecla a partir da tabela do uiohook (`UiohookKey`: nome → código). */
export function keyLabel(code: number, table: Record<string, number>): string {
  const name = Object.keys(table).find((k) => table[k] === code)
  if (!name) return `Tecla ${code}`
  if (KEY_NAMES[name]) return KEY_NAMES[name]
  if (name.startsWith('Numpad')) return `${name.slice(6)} (teclado numérico)`
  return name
}

function sameBinding(a: PttBinding | null, b: PttBinding | null): boolean {
  return a?.kind === b?.kind && a?.code === b?.code
}

export function createPushToTalkController(deps: PttDeps) {
  let config: PttConfig = { enabled: false, binding: null }
  let hook: PttHook | null = null
  let unavailable = false
  let running = false
  let pressed = false
  let releaseTimer: unknown = null
  let capturing: { resolve: (b: PttBinding | null) => void; timer: unknown } | null = null

  function releaseNow(): void {
    if (releaseTimer !== null) deps.clearTimeout(releaseTimer)
    releaseTimer = null
    if (pressed) {
      pressed = false
      deps.send(false)
    }
  }

  /** Liga o gancho só quando precisa (modo ligado com tecla, ou escolhendo a tecla). */
  function syncHook(): void {
    const needed = (config.enabled && !!config.binding) || !!capturing
    if (needed && !running) {
      if (unavailable) return
      if (!hook) hook = deps.createHook(onEvent)
      if (!hook) {
        unavailable = true
        deps.notifyUnavailable()
        return
      }
      hook.start()
      running = true
    } else if (!needed && running) {
      hook?.stop()
      running = false
      releaseNow()
    }
  }

  function finishCapture(binding: PttBinding | null): void {
    if (!capturing) return
    const { resolve, timer } = capturing
    capturing = null
    deps.clearTimeout(timer)
    syncHook()
    resolve(binding)
  }

  function onEvent(e: HookEvent): void {
    if (capturing) {
      if (!e.down) return
      if (e.kind === 'key' && e.code === ESCAPE) return finishCapture(null)
      if (e.kind === 'mouse' && !PTT_MOUSE_BUTTONS.includes(e.code as never)) return
      const label = e.kind === 'mouse' ? MOUSE_LABELS[e.code] : deps.keyLabel(e.code)
      return finishCapture({ kind: e.kind, code: e.code, label })
    }
    const b = config.binding
    if (!config.enabled || !b || b.kind !== e.kind || b.code !== e.code) return
    if (e.down) {
      // segurando, o sistema repete o "pressionado": só o primeiro conta
      if (releaseTimer !== null) {
        deps.clearTimeout(releaseTimer)
        releaseTimer = null
      }
      if (!pressed) {
        pressed = true
        deps.send(true)
      }
    } else if (pressed && releaseTimer === null) {
      releaseTimer = deps.setTimeout(() => {
        releaseTimer = null
        pressed = false
        deps.send(false)
      }, PTT_RELEASE_DELAY_MS)
    }
  }

  return {
    setConfig(raw: unknown): void {
      const next = cleanPttConfig(raw)
      if (!next.enabled || !sameBinding(next.binding, config.binding)) releaseNow()
      config = next
      syncHook()
    },
    /** Espera a próxima tecla/botão (Esc, tempo esgotado ou gancho indisponível = null). */
    capture(): Promise<PttBinding | null> {
      finishCapture(null)
      releaseNow()
      return new Promise((resolve) => {
        capturing = { resolve, timer: deps.setTimeout(() => finishCapture(null), PTT_CAPTURE_TIMEOUT_MS) }
        syncHook()
        if (!running) finishCapture(null)
      })
    },
    get pressed(): boolean {
      return pressed
    },
    get running(): boolean {
      return running
    },
    destroy(): void {
      finishCapture(null)
      if (running) hook?.stop()
      running = false
      releaseNow()
    }
  }
}

export type PushToTalkController = ReturnType<typeof createPushToTalkController>

/** Carrega o uiohook só quando precisa: se o binário nativo faltar, o resto do app continua. */
function createUiohook(listener: (event: HookEvent) => void): { hook: PttHook; table: Record<string, number> } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { uIOhook, UiohookKey } = require('uiohook-napi') as typeof import('uiohook-napi')
    const mouse = (e: { button: unknown }): number => (typeof e.button === 'number' ? e.button : 0)
    uIOhook.on('keydown', (e) => listener({ kind: 'key', code: e.keycode, down: true }))
    uIOhook.on('keyup', (e) => listener({ kind: 'key', code: e.keycode, down: false }))
    uIOhook.on('mousedown', (e) => listener({ kind: 'mouse', code: mouse(e), down: true }))
    uIOhook.on('mouseup', (e) => listener({ kind: 'mouse', code: mouse(e), down: false }))
    return { hook: { start: () => uIOhook.start(), stop: () => uIOhook.stop() }, table: UiohookKey as Record<string, number> }
  } catch (err) {
    console.warn('[push-to-talk] não foi possível ouvir o teclado do sistema:', err)
    return null
  }
}

/** Liga o push-to-talk ao Electron. Devolve o controlador (o `main` desliga o gancho ao sair). */
export function setupPushToTalk(getMainWindow: () => BrowserWindow | null): PushToTalkController {
  let table: Record<string, number> = {}
  const send = (channel: string, ...args: unknown[]): void => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
  }
  const controller = createPushToTalkController({
    createHook: (listener) => {
      const created = createUiohook(listener)
      if (!created) return null
      table = created.table
      return created.hook
    },
    keyLabel: (code) => keyLabel(code, table),
    send: (pressed) => send('ptt-change', pressed),
    notifyUnavailable: () => send('ptt-unavailable'),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>)
  })
  ipcMain.on('ptt-config', (_event, raw: unknown) => controller.setConfig(raw))
  ipcMain.handle('ptt-capture', () => controller.capture())
  return controller
}
