// Pressione para falar no processo principal (B20), sem Electron nem gancho de verdade: quando o gancho
// roda, pressionar/soltar (com repetição e atraso ao soltar), trocar a tecla, escolher a tecla e nomes.
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PTT_CAPTURE_TIMEOUT_MS, PTT_RELEASE_DELAY_MS } from '../shared/push-to-talk'

vi.mock('electron', () => ({ ipcMain: {} }))

const { createPushToTalkController, keyLabel } = await import('./push-to-talk')
type HookEvent = import('./push-to-talk').HookEvent

const V = { kind: 'key' as const, code: 47, label: 'V' }

let emit: (e: HookEvent) => void
let hook: { start: Mock<() => void>; stop: Mock<() => void> }
let sent: boolean[]
let unavailable: number
let timers: Map<number, { fn: () => void; ms: number }>
let nextTimer: number
let hookAvailable: boolean

function setup() {
  return createPushToTalkController({
    createHook: (listener) => {
      emit = listener
      return hookAvailable ? hook : null
    },
    keyLabel: (code) => (code === 57 ? 'Espaço' : `K${code}`),
    send: (pressed) => sent.push(pressed),
    notifyUnavailable: () => unavailable++,
    setTimeout: (fn, ms) => {
      timers.set(++nextTimer, { fn, ms })
      return nextTimer
    },
    clearTimeout: (id) => timers.delete(id as number)
  })
}

/** Dispara os relógios pendentes (do mais antigo ao mais novo). */
function runTimers(ms?: number): void {
  for (const [id, t] of [...timers]) {
    if (ms !== undefined && t.ms !== ms) continue
    timers.delete(id)
    t.fn()
  }
}

const key = (code: number, down: boolean): HookEvent => ({ kind: 'key', code, down })

beforeEach(() => {
  hook = { start: vi.fn(), stop: vi.fn() }
  sent = []
  unavailable = 0
  timers = new Map()
  nextTimer = 0
  hookAvailable = true
})

describe('gancho do teclado', () => {
  it('só roda com o modo ligado e uma tecla escolhida', () => {
    const ptt = setup()
    ptt.setConfig({ enabled: false, binding: V })
    expect(hook.start).not.toHaveBeenCalled()
    ptt.setConfig({ enabled: true, binding: null })
    expect(hook.start).not.toHaveBeenCalled()
    ptt.setConfig({ enabled: true, binding: V })
    expect(hook.start).toHaveBeenCalledTimes(1)
    ptt.setConfig({ enabled: false, binding: V })
    expect(hook.stop).toHaveBeenCalledTimes(1)
    expect(ptt.running).toBe(false)
  })

  it('biblioteca nativa indisponível: avisa uma vez e não tenta de novo', () => {
    hookAvailable = false
    const ptt = setup()
    ptt.setConfig({ enabled: true, binding: V })
    ptt.setConfig({ enabled: false, binding: V })
    ptt.setConfig({ enabled: true, binding: V })
    expect(unavailable).toBe(1)
    expect(ptt.running).toBe(false)
  })
})

describe('pressionar e soltar', () => {
  it('pressionar avisa uma vez (a repetição do sistema não conta); soltar avisa depois do atraso', () => {
    const ptt = setup()
    ptt.setConfig({ enabled: true, binding: V })
    emit(key(47, true))
    emit(key(47, true))
    emit(key(47, true))
    expect(sent).toEqual([true])
    emit(key(47, false))
    expect(sent).toEqual([true]) // ainda no atraso: não corta o fim da palavra
    expect([...timers.values()][0].ms).toBe(PTT_RELEASE_DELAY_MS)
    runTimers()
    expect(sent).toEqual([true, false])
    expect(ptt.pressed).toBe(false)
  })

  it('pressionar de novo durante o atraso mantém o microfone aberto', () => {
    const ptt = setup()
    ptt.setConfig({ enabled: true, binding: V })
    emit(key(47, true))
    emit(key(47, false))
    emit(key(47, true))
    expect(timers.size).toBe(0)
    expect(sent).toEqual([true])
    expect(ptt.pressed).toBe(true)
  })

  it('outras teclas e o mouse não abrem o microfone', () => {
    const ptt = setup()
    ptt.setConfig({ enabled: true, binding: V })
    emit(key(30, true))
    emit({ kind: 'mouse', code: 47, down: true })
    expect(sent).toEqual([])
  })

  it('botão do mouse escolhido funciona como tecla', () => {
    const ptt = setup()
    ptt.setConfig({ enabled: true, binding: { kind: 'mouse', code: 4, label: 'Botão 4 do mouse' } })
    emit({ kind: 'mouse', code: 4, down: true })
    emit({ kind: 'mouse', code: 4, down: false })
    runTimers()
    expect(sent).toEqual([true, false])
  })

  it('desligar ou trocar a tecla com ela pressionada fecha o microfone na hora', () => {
    const ptt = setup()
    ptt.setConfig({ enabled: true, binding: V })
    emit(key(47, true))
    ptt.setConfig({ enabled: true, binding: { kind: 'key', code: 57, label: 'Espaço' } })
    expect(sent).toEqual([true, false])
    emit(key(57, true))
    ptt.setConfig({ enabled: false, binding: null })
    expect(sent).toEqual([true, false, true, false])
  })

  it('configuração inválida vinda do renderer vira desligado', () => {
    const ptt = setup()
    ptt.setConfig({ enabled: 'sim', binding: { kind: 'joystick', code: 1 } })
    expect(hook.start).not.toHaveBeenCalled()
  })
})

describe('escolher a tecla', () => {
  it('a próxima tecla vira a escolha, com o nome; o gancho para se o modo está desligado', async () => {
    const ptt = setup()
    const chosen = ptt.capture()
    expect(hook.start).toHaveBeenCalled()
    emit(key(57, false)) // soltar não conta
    emit(key(57, true))
    expect(await chosen).toEqual({ kind: 'key', code: 57, label: 'Espaço' })
    expect(hook.stop).toHaveBeenCalled()
  })

  it('Esc desiste; clique esquerdo/direito é ignorado; botão lateral do mouse vale', async () => {
    const ptt = setup()
    const first = ptt.capture()
    emit(key(1, true))
    expect(await first).toBeNull()
    const second = ptt.capture()
    emit({ kind: 'mouse', code: 1, down: true })
    emit({ kind: 'mouse', code: 2, down: true })
    emit({ kind: 'mouse', code: 5, down: true })
    expect(await second).toEqual({ kind: 'mouse', code: 5, label: 'Botão 5 do mouse' })
  })

  it('escolhendo, a tecla atual não abre o microfone; o gancho continua com o modo ligado', async () => {
    const ptt = setup()
    ptt.setConfig({ enabled: true, binding: V })
    const chosen = ptt.capture()
    emit(key(47, true))
    expect(await chosen).toEqual({ kind: 'key', code: 47, label: 'K47' })
    expect(sent).toEqual([])
    expect(ptt.running).toBe(true)
  })

  it('tempo esgotado ou gancho indisponível: null', async () => {
    const ptt = setup()
    const chosen = ptt.capture()
    runTimers(PTT_CAPTURE_TIMEOUT_MS)
    expect(await chosen).toBeNull()

    hookAvailable = false
    expect(await setup().capture()).toBeNull()
  })
})

describe('keyLabel', () => {
  const table = { V: 47, Space: 57, Numpad5: 76, CtrlRight: 3613, F13: 91 }
  it('letras e F-teclas pelo nome; especiais em português; desconhecida pelo código', () => {
    expect(keyLabel(47, table)).toBe('V')
    expect(keyLabel(91, table)).toBe('F13')
    expect(keyLabel(57, table)).toBe('Espaço')
    expect(keyLabel(3613, table)).toBe('Ctrl direito')
    expect(keyLabel(76, table)).toBe('5 (teclado numérico)')
    expect(keyLabel(999, table)).toBe('Tecla 999')
  })
})
