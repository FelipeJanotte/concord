// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PttCapture, PttConfig, PushToTalkBridge } from '@shared/push-to-talk'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { choosePttKey, handlePttChange, loadPushToTalkPreferences, PTT_KEY, pttEnv, setPttSounds, setPushToTalk, startPushToTalk } from './push-to-talk'
import { chimes } from './voice-sounds'

function fakeBridge() {
  let change: ((pressed: boolean) => void) | null = null
  let unavailable: (() => void) | null = null
  let resolveCapture: ((c: PttCapture) => void) | null = null
  const configs: PttConfig[] = []
  const bridge: PushToTalkBridge = {
    setConfig: (c) => configs.push(c),
    capture: () => new Promise((r) => (resolveCapture = r)),
    onChange: (l) => {
      change = l
      return () => (change = null)
    },
    onUnavailable: (l) => {
      unavailable = l
      return () => (unavailable = null)
    }
  }
  return {
    bridge,
    configs,
    press: (pressed: boolean) => change?.(pressed),
    unavailable: () => unavailable?.(),
    capture: (c: PttCapture) => resolveCapture?.(c)
  }
}

let fake: ReturnType<typeof fakeBridge>
let gate: ReturnType<typeof vi.spyOn>
let play: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  localStorage.clear()
  fake = fakeBridge()
  vi.spyOn(pttEnv, 'bridge').mockReturnValue(fake.bridge)
  gate = vi.spyOn(voice, 'setMicGate').mockImplementation(() => {})
  play = vi.spyOn(chimes, 'play').mockReturnValue(true)
  useApp.setState({ ...initialState, myVoiceChannelId: 'sala' })
  loadPushToTalkPreferences()
})
afterEach(() => vi.restoreAllMocks())

describe('preferência', () => {
  it('padrão: desligado, tecla V, com som; microfone aberto', () => {
    expect(useApp.getState()).toMatchObject({ pushToTalk: false, pttBinding: { code: 47, label: 'V' }, pttSounds: true, pttAvailable: true })
    expect(gate).toHaveBeenLastCalledWith(true)
    expect(fake.configs.at(-1)).toEqual({ enabled: false, binding: { kind: 'key', code: 47, label: 'V' } })
  })

  it('ligar fecha o microfone, avisa o processo principal e fica salvo', () => {
    setPushToTalk(true)
    expect(gate).toHaveBeenLastCalledWith(false)
    expect(fake.configs.at(-1)?.enabled).toBe(true)
    setPttSounds(false)
    useApp.setState({ ...initialState })
    loadPushToTalkPreferences()
    expect(useApp.getState()).toMatchObject({ pushToTalk: true, pttSounds: false })
  })

  it('salvo inválido volta ao padrão', () => {
    localStorage.setItem(PTT_KEY, JSON.stringify({ enabled: 'sim', binding: { kind: 'mouse', code: 1 }, sounds: 3 }))
    loadPushToTalkPreferences()
    expect(useApp.getState()).toMatchObject({ pushToTalk: false, pttBinding: { code: 47 }, pttSounds: true })
  })

  it('fora do app desktop: indisponível e não liga', () => {
    vi.spyOn(pttEnv, 'bridge').mockReturnValue(null)
    loadPushToTalkPreferences()
    setPushToTalk(true)
    expect(useApp.getState()).toMatchObject({ pttAvailable: false, pushToTalk: false })
    expect(useApp.getState().notice?.text).toMatch(/app instalado/)
  })
})

describe('tecla pressionada e solta', () => {
  it('abre e fecha o microfone, com som', () => {
    setPushToTalk(true)
    handlePttChange(true)
    expect(useApp.getState().pttPressed).toBe(true)
    expect(gate).toHaveBeenLastCalledWith(true)
    expect(play).toHaveBeenLastCalledWith('ptt-on', expect.objectContaining({ volume: expect.any(Number) }))
    handlePttChange(false)
    expect(gate).toHaveBeenLastCalledWith(false)
    expect(play).toHaveBeenLastCalledWith('ptt-off', expect.anything())
  })

  it('sem som: desligado nas configurações, silenciado ou fora de sala', () => {
    setPushToTalk(true)
    setPttSounds(false)
    handlePttChange(true)
    handlePttChange(false)
    setPttSounds(true)
    useApp.setState({ muted: true })
    handlePttChange(true)
    handlePttChange(false)
    useApp.setState({ muted: false, myVoiceChannelId: null })
    handlePttChange(true)
    expect(play).not.toHaveBeenCalled()
  })

  it('com o modo desligado, aviso atrasado do processo principal é ignorado', () => {
    handlePttChange(true)
    expect(useApp.getState().pttPressed).toBe(false)
    expect(gate).toHaveBeenLastCalledWith(true)
  })

  it('o aviso chega pela ponte depois de startPushToTalk', () => {
    const stop = startPushToTalk()
    setPushToTalk(true)
    fake.press(true)
    expect(useApp.getState().pttPressed).toBe(true)
    stop()
  })
})

describe('trocar a tecla e indisponível', () => {
  it('a tecla pressionada vira a nova e fica salva; Esc (cancelado) mantém a antiga', async () => {
    const chosen = choosePttKey()
    expect(useApp.getState().pttCapturing).toBe(true)
    fake.capture({ kind: 'chosen', binding: { kind: 'mouse', code: 4, label: 'Botão 4 do mouse' } })
    await chosen
    expect(useApp.getState()).toMatchObject({ pttCapturing: false, pttBinding: { kind: 'mouse', code: 4 } })
    expect(JSON.parse(localStorage.getItem(PTT_KEY)!).binding.code).toBe(4)

    const again = choosePttKey()
    fake.capture({ kind: 'cancelled' })
    await again
    expect(useApp.getState().pttBinding.code).toBe(4)
  })

  it('o processo principal não consegue ouvir o teclado: desliga e avisa', () => {
    const stop = startPushToTalk()
    setPushToTalk(true)
    fake.unavailable()
    expect(useApp.getState()).toMatchObject({ pttAvailable: false, pushToTalk: false })
    expect(gate).toHaveBeenLastCalledWith(true)
    expect(useApp.getState().notice?.text).toMatch(/teclado do sistema/)
    stop()
  })
})
