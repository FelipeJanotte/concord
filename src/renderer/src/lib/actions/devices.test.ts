// Dispositivos de áudio e volume (lib/actions/devices.ts): preferências salvas e aplicadas no VoiceClient.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import {
  canChooseAudioOutput,
  listAudioDevices,
  loadAudioPreferences,
  selectAudioInput,
  selectAudioOutput,
  setUserMuted,
  setUserVolume
} from './devices'

class MemoryStorage {
  data = new Map<string, string>()
  getItem = (k: string): string | null => this.data.get(k) ?? null
  setItem = (k: string, v: string): void => void this.data.set(k, v)
  removeItem = (k: string): void => void this.data.delete(k)
}

let storage: MemoryStorage
const saved = (): unknown => JSON.parse(storage.getItem('concord:audio') ?? 'null')

function device(deviceId: string, kind: MediaDeviceKind, label = ''): MediaDeviceInfo {
  return { deviceId, kind, label, groupId: '' } as MediaDeviceInfo
}

beforeEach(() => {
  useApp.setState({ ...initialState })
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.spyOn(voice, 'setInputDevice').mockResolvedValue()
  vi.spyOn(voice, 'setOutputDevice').mockResolvedValue()
  vi.spyOn(voice, 'setUserVolume').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('loadAudioPreferences', () => {
  it('aplica o que estava salvo na store e no VoiceClient', () => {
    storage.setItem('concord:audio', JSON.stringify({ input: 'mic-usb', output: 'fone', volumes: { 'acc-ana': 0.4 } }))
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ audioInputId: 'mic-usb', audioOutputId: 'fone', userVolumes: { 'acc-ana': 0.4 } })
    expect(voice.setInputDevice).toHaveBeenCalledWith('mic-usb')
    expect(voice.setOutputDevice).toHaveBeenCalledWith('fone')
    expect(voice.setUserVolume).toHaveBeenCalledWith('acc-ana', 0.4)
  })

  it('ignora dados corrompidos ou inválidos', () => {
    storage.setItem('concord:audio', '{isso não é json')
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ audioInputId: null, audioOutputId: null, userVolumes: {} })

    storage.setItem('concord:audio', JSON.stringify({ input: 42, output: '', volumes: { a: 'alto', b: 7, c: -1, d: 0.5 } }))
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ audioInputId: null, audioOutputId: null, userVolumes: { d: 0.5 } })
  })

  it('sem localStorage (bloqueado), começa com os padrões', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      }
    })
    expect(() => loadAudioPreferences()).not.toThrow()
    expect(useApp.getState().audioInputId).toBeNull()
  })
})

describe('escolher dispositivo', () => {
  it('microfone e saída: guarda, salva e aplica', async () => {
    await selectAudioInput('mic-usb')
    await selectAudioOutput('fone')
    expect(useApp.getState()).toMatchObject({ audioInputId: 'mic-usb', audioOutputId: 'fone' })
    expect(saved()).toEqual({ input: 'mic-usb', output: 'fone', volumes: {}, muted: [] })
    expect(voice.setInputDevice).toHaveBeenCalledWith('mic-usb')
    expect(voice.setOutputDevice).toHaveBeenCalledWith('fone')

    await selectAudioInput(null)
    expect(saved()).toMatchObject({ input: null })
  })

  it('falha ao trocar vira aviso (a escolha continua salva)', async () => {
    vi.mocked(voice.setInputDevice).mockRejectedValue(new Error('NotReadableError'))
    await selectAudioInput('mic-ocupado')
    expect(useApp.getState().notice?.text).toBe('Não foi possível usar esse microfone.')
    expect(saved()).toMatchObject({ input: 'mic-ocupado' })
  })

  it('salvar com o armazenamento bloqueado não quebra', async () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('cheio')
      }
    })
    await expect(selectAudioOutput('fone')).resolves.toBeUndefined()
    expect(useApp.getState().audioOutputId).toBe('fone')
  })
})

describe('volume por pessoa', () => {
  it('guarda por conta; 100% some da lista', () => {
    setUserVolume('acc-ana', 0.25)
    expect(useApp.getState().userVolumes).toEqual({ 'acc-ana': 0.25 })
    expect(saved()).toMatchObject({ volumes: { 'acc-ana': 0.25 } })
    expect(voice.setUserVolume).toHaveBeenLastCalledWith('acc-ana', 0.25)

    setUserVolume('acc-ana', 1)
    expect(useApp.getState().userVolumes).toEqual({})
  })

  it('corrige valores fora de 0–1', () => {
    setUserVolume('acc-ana', 3)
    expect(useApp.getState().userVolumes).toEqual({})
    setUserVolume('acc-ana', -2)
    expect(useApp.getState().userVolumes).toEqual({ 'acc-ana': 0 })
  })
})

describe('listAudioDevices', () => {
  it('tira os apelidos do Windows e dá nome a quem veio sem', async () => {
    vi.spyOn(voice, 'listDevices').mockImplementation(async (kind) =>
      kind === 'audioinput'
        ? [device('default', kind, 'Padrão'), device('communications', kind), device('m1', kind, 'Headset USB'), device('m2', kind)]
        : [device('o1', kind)]
    )
    expect(await listAudioDevices()).toEqual({
      inputs: [
        { deviceId: 'm1', label: 'Headset USB' },
        { deviceId: 'm2', label: 'Microfone 2' }
      ],
      outputs: [{ deviceId: 'o1', label: 'Saída 1' }]
    })
  })
})

describe('canChooseAudioOutput', () => {
  it('depende de setSinkId existir', () => {
    vi.stubGlobal('HTMLMediaElement', class {})
    expect(canChooseAudioOutput()).toBe(false)
    vi.stubGlobal('HTMLMediaElement', class { setSinkId() {} })
    expect(canChooseAudioOutput()).toBe(true)
  })
})

describe('silenciar alguém', () => {
  it('guarda, salva e avisa o VoiceClient; o volume continua guardado', () => {
    vi.spyOn(voice, 'setUserMuted').mockImplementation(() => {})
    setUserVolume('acc-ana', 0.4)
    setUserMuted('acc-ana', true)
    expect(useApp.getState().userMuted).toEqual({ 'acc-ana': true })
    expect(useApp.getState().userVolumes).toEqual({ 'acc-ana': 0.4 })
    expect(saved()).toMatchObject({ volumes: { 'acc-ana': 0.4 }, muted: ['acc-ana'] })
    expect(voice.setUserMuted).toHaveBeenLastCalledWith('acc-ana', true)

    setUserMuted('acc-ana', false)
    expect(useApp.getState().userMuted).toEqual({})
    expect(saved()).toMatchObject({ muted: [] })
  })

  it('volta silenciado depois de reabrir o app', () => {
    vi.spyOn(voice, 'setUserMuted').mockImplementation(() => {})
    storage.setItem('concord:audio', JSON.stringify({ input: null, output: null, volumes: {}, muted: ['acc-ana', 42, ''] }))
    loadAudioPreferences()
    expect(useApp.getState().userMuted).toEqual({ 'acc-ana': true })
    expect(voice.setUserMuted).toHaveBeenCalledWith('acc-ana', true)
    expect(voice.setUserMuted).toHaveBeenCalledTimes(1)
  })
})
