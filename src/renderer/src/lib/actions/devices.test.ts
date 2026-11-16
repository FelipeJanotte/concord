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
  setMicGain,
  setNoiseSuppression,
  setOutputVolume,
  setUserVolume,
  setVoiceSounds,
  setVoiceLeveler,
  setVoiceLevelerTarget
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
    expect(saved()).toEqual({ input: 'mic-usb', output: 'fone', camera: null, volumes: {}, muted: [], sounds: { enabled: true, volume: 0.5 }, noise: true, micGain: 1, outputVolume: 1, leveler: false, levelerTarget: 'medium' })
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
        : kind === 'videoinput'
          ? [device('default', kind), device('c1', kind)]
          : [device('o1', kind)]
    )
    expect(await listAudioDevices()).toEqual({
      inputs: [
        { deviceId: 'm1', label: 'Headset USB' },
        { deviceId: 'm2', label: 'Microfone 2' }
      ],
      outputs: [{ deviceId: 'o1', label: 'Saída 1' }],
      cameras: [{ deviceId: 'c1', label: 'Câmera 1' }]
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

describe('sons de entrar/sair (B16)', () => {
  it('começa ligado em 50%', () => {
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ voiceSoundsEnabled: true, voiceSoundsVolume: 0.5 })
  })

  it('liga/desliga e ajusta o volume, salvando', () => {
    setVoiceSounds({ enabled: false })
    setVoiceSounds({ volume: 0.2 })
    expect(useApp.getState()).toMatchObject({ voiceSoundsEnabled: false, voiceSoundsVolume: 0.2 })
    expect(saved()).toMatchObject({ sounds: { enabled: false, volume: 0.2 } })
  })

  it('corrige volume fora de 0–1 e ignora valores inválidos', () => {
    setVoiceSounds({ volume: 3 })
    expect(useApp.getState().voiceSoundsVolume).toBe(1)
    setVoiceSounds({ volume: Number.NaN, enabled: 'sim' as unknown as boolean })
    expect(useApp.getState()).toMatchObject({ voiceSoundsEnabled: true, voiceSoundsVolume: 1 })
  })

  it('volta como estava depois de reabrir; dados ruins voltam ao padrão', () => {
    storage.setItem('concord:audio', JSON.stringify({ sounds: { enabled: false, volume: 0.7 } }))
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ voiceSoundsEnabled: false, voiceSoundsVolume: 0.7 })
    storage.setItem('concord:audio', JSON.stringify({ sounds: { enabled: 'não', volume: 9 } }))
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ voiceSoundsEnabled: true, voiceSoundsVolume: 0.5 })
  })
})

describe('supressão de ruído (B13)', () => {
  it('começa ligada e aplica no VoiceClient ao carregar', () => {
    const apply = vi.spyOn(voice, 'setNoiseSuppression').mockResolvedValue()
    loadAudioPreferences()
    expect(useApp.getState().noiseSuppression).toBe(true)
    expect(apply).toHaveBeenCalledWith(true)
  })

  it('desligar salva e avisa o VoiceClient; volta desligada depois de reabrir', async () => {
    const apply = vi.spyOn(voice, 'setNoiseSuppression').mockResolvedValue()
    await setNoiseSuppression(false)
    expect(useApp.getState().noiseSuppression).toBe(false)
    expect(saved()).toMatchObject({ noise: false })
    expect(apply).toHaveBeenLastCalledWith(false)
    useApp.setState({ noiseSuppression: true })
    loadAudioPreferences()
    expect(useApp.getState().noiseSuppression).toBe(false)
  })

  it('valor inválido salvo volta ao padrão (ligada)', () => {
    vi.spyOn(voice, 'setNoiseSuppression').mockResolvedValue()
    storage.setItem('concord:audio', JSON.stringify({ noise: 'sim' }))
    loadAudioPreferences()
    expect(useApp.getState().noiseSuppression).toBe(true)
  })

  it('falha ao trocar vira aviso', async () => {
    vi.spyOn(voice, 'setNoiseSuppression').mockRejectedValue(new Error('falhou'))
    await setNoiseSuppression(false)
    expect(useApp.getState().notice?.text).toBe('Não foi possível mudar a supressão de ruído.')
  })

  it('o modo informado pelo VoiceClient vai para a store', () => {
    voice.onNoiseModeChange?.('advanced')
    expect(useApp.getState().noiseMode).toBe('advanced')
    voice.onNoiseModeChange?.(null)
    expect(useApp.getState().noiseMode).toBeNull()
  })
})

describe('volume do microfone e de saída', () => {
  it('começam em 100% e são aplicados no VoiceClient ao carregar', () => {
    const mic = vi.spyOn(voice, 'setMicGain').mockResolvedValue()
    const out = vi.spyOn(voice, 'setOutputVolume').mockImplementation(() => {})
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ micGain: 1, outputVolume: 1 })
    expect(mic).toHaveBeenCalledWith(1)
    expect(out).toHaveBeenCalledWith(1)
  })

  it('ajustar salva, avisa o VoiceClient e volta igual depois de reabrir', async () => {
    const mic = vi.spyOn(voice, 'setMicGain').mockResolvedValue()
    const out = vi.spyOn(voice, 'setOutputVolume').mockImplementation(() => {})
    await setMicGain(1.5)
    setOutputVolume(0.4)
    expect(useApp.getState()).toMatchObject({ micGain: 1.5, outputVolume: 0.4 })
    expect(saved()).toMatchObject({ micGain: 1.5, outputVolume: 0.4 })
    expect(mic).toHaveBeenLastCalledWith(1.5)
    expect(out).toHaveBeenLastCalledWith(0.4)
    useApp.setState({ micGain: 1, outputVolume: 1 })
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ micGain: 1.5, outputVolume: 0.4 })
  })

  it('corrige valores fora do limite (microfone até 200%, saída até 100%) e dados ruins', async () => {
    vi.spyOn(voice, 'setMicGain').mockResolvedValue()
    vi.spyOn(voice, 'setOutputVolume').mockImplementation(() => {})
    await setMicGain(7)
    setOutputVolume(2)
    expect(useApp.getState()).toMatchObject({ micGain: 2, outputVolume: 1 })
    storage.setItem('concord:audio', JSON.stringify({ micGain: 'alto', outputVolume: -3 }))
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ micGain: 1, outputVolume: 0 })
  })

  it('falha ao ajustar o microfone vira aviso', async () => {
    vi.spyOn(voice, 'setMicGain').mockRejectedValue(new Error('falhou'))
    await setMicGain(1.2)
    expect(useApp.getState().notice?.text).toBe('Não foi possível ajustar o volume do microfone.')
  })
})

describe('equalizador automático', () => {
  it('começa desligado no alvo médio e é aplicado no VoiceClient ao carregar', () => {
    const on = vi.spyOn(voice, 'setLeveler')
    const target = vi.spyOn(voice, 'setLevelerTarget')
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ voiceLeveler: false, voiceLevelerTarget: 'medium' })
    expect(on).toHaveBeenLastCalledWith(false)
    expect(target).toHaveBeenLastCalledWith('medium')
  })

  it('ligar e trocar o alvo salva, avisa o VoiceClient e volta igual depois de reabrir', () => {
    const on = vi.spyOn(voice, 'setLeveler').mockImplementation(() => {})
    const target = vi.spyOn(voice, 'setLevelerTarget').mockImplementation(() => {})
    setVoiceLeveler(true)
    setVoiceLevelerTarget('high')
    expect(useApp.getState()).toMatchObject({ voiceLeveler: true, voiceLevelerTarget: 'high' })
    expect(saved()).toMatchObject({ leveler: true, levelerTarget: 'high' })
    expect(on).toHaveBeenLastCalledWith(true)
    expect(target).toHaveBeenLastCalledWith('high')
    useApp.setState({ voiceLeveler: false, voiceLevelerTarget: 'medium' })
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ voiceLeveler: true, voiceLevelerTarget: 'high' })
  })

  it('dados ruins voltam ao padrão', () => {
    vi.spyOn(voice, 'setLeveler').mockImplementation(() => {})
    storage.setItem('concord:audio', JSON.stringify({ leveler: 'sim', levelerTarget: 'altíssimo' }))
    loadAudioPreferences()
    expect(useApp.getState()).toMatchObject({ voiceLeveler: false, voiceLevelerTarget: 'medium' })
  })

  it('o ganho de cada conta informado pelo VoiceClient vai para a store', () => {
    voice.onLevelerGains?.({ 'acc-ana': 1.4 })
    expect(useApp.getState().levelerGains).toEqual({ 'acc-ana': 1.4 })
    voice.onLevelerGains?.({})
    expect(useApp.getState().levelerGains).toEqual({})
  })
})
