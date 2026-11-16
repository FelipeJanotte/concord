/**
 * Dispositivos de áudio, câmera (B21), volume do microfone e de saída, e volume por pessoa (B4). Tudo é preferência desta máquina:
 * fica no localStorage (`concord:audio`) e é aplicado ao VoiceClient ao abrir o app.
 * Nada vai para o servidor.
 */
import { get, notify, set } from '../core'
import { voice } from '../voice'
import { openSettings } from './settings'
import { clampMicGain, clampOutputVolume } from '../mic-gain'
import { clampLevelerTarget, type LevelerTarget } from '../leveler/level'

// O que a supressão de ruído está fazendo agora (aparece em Configurações de voz).
voice.onNoiseModeChange = (mode) => set({ noiseMode: mode })
voice.onLevelerGains = (gains) => set({ levelerGains: gains })

const STORAGE_KEY = 'concord:audio'

export interface AudioDevice {
  deviceId: string
  label: string
}

interface SavedAudio {
  input: string | null
  output: string | null
  /** câmera escolhida (B21) */
  camera: string | null
  volumes: Record<string, number>
  /** contas silenciadas */
  muted: string[]
  /** sons de entrar/sair da sala (B16) */
  sounds: { enabled: boolean; volume: number }
  /** supressão de ruído automática (B13) */
  noise: boolean
  /** volume do microfone (0 a 2) */
  micGain: number
  /** volume de saída (0 a 1) */
  outputVolume: number
  leveler: boolean
  levelerTarget: LevelerTarget
}

function readSaved(): SavedAudio {
  const empty: SavedAudio = {
    input: null,
    output: null,
    camera: null,
    volumes: {},
    muted: [],
    sounds: { enabled: true, volume: 0.5 },
    noise: true,
    micGain: 1,
    outputVolume: 1,
    leveler: false,
    levelerTarget: 'medium'
  }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return empty
    const data = JSON.parse(raw) as Partial<SavedAudio>
    const volumes: Record<string, number> = {}
    for (const [id, v] of Object.entries(data.volumes ?? {})) {
      if (typeof v === 'number' && v >= 0 && v < 1) volumes[id] = v
    }
    return {
      input: typeof data.input === 'string' && data.input ? data.input : null,
      output: typeof data.output === 'string' && data.output ? data.output : null,
      camera: typeof data.camera === 'string' && data.camera ? data.camera : null,
      volumes,
      muted: Array.isArray(data.muted) ? data.muted.filter((id): id is string => typeof id === 'string' && !!id) : [],
      sounds: {
        enabled: typeof data.sounds?.enabled === 'boolean' ? data.sounds.enabled : empty.sounds.enabled,
        volume:
          typeof data.sounds?.volume === 'number' && data.sounds.volume >= 0 && data.sounds.volume <= 1
            ? data.sounds.volume
            : empty.sounds.volume
      },
      noise: typeof data.noise === 'boolean' ? data.noise : empty.noise,
      micGain: clampMicGain(data.micGain),
      outputVolume: clampOutputVolume(data.outputVolume),
      leveler: data.leveler === true,
      levelerTarget: clampLevelerTarget(data.levelerTarget)
    }
  } catch {
    return empty
  }
}

function save(): void {
  const {
    audioInputId,
    audioOutputId,
    cameraId,
    userVolumes,
    userMuted,
    voiceSoundsEnabled,
    voiceSoundsVolume,
    noiseSuppression,
    micGain,
    outputVolume,
    voiceLeveler,
    voiceLevelerTarget
  } = get()
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        input: audioInputId,
        output: audioOutputId,
        camera: cameraId,
        volumes: userVolumes,
        muted: Object.keys(userMuted),
        sounds: { enabled: voiceSoundsEnabled, volume: voiceSoundsVolume },
        noise: noiseSuppression,
        micGain,
        outputVolume,
        leveler: voiceLeveler,
        levelerTarget: voiceLevelerTarget
      })
    )
  } catch {
    // modo privado / armazenamento bloqueado: vale só até fechar o app
  }
}

/** Lê as preferências salvas e aplica no VoiceClient. Chamado uma vez ao carregar. */
export function loadAudioPreferences(): void {
  const saved = readSaved()
  const userMuted: Record<string, true> = {}
  for (const id of saved.muted) userMuted[id] = true
  set({
    audioInputId: saved.input,
    audioOutputId: saved.output,
    cameraId: saved.camera,
    userVolumes: saved.volumes,
    userMuted,
    voiceSoundsEnabled: saved.sounds.enabled,
    voiceSoundsVolume: saved.sounds.volume,
    noiseSuppression: saved.noise,
    micGain: saved.micGain,
    outputVolume: saved.outputVolume,
    voiceLeveler: saved.leveler,
    voiceLevelerTarget: saved.levelerTarget
  })
  voice.setLevelerTarget(saved.levelerTarget)
  voice.setLeveler(saved.leveler)
  void voice.setNoiseSuppression(saved.noise)
  void voice.setMicGain(saved.micGain)
  voice.setOutputVolume(saved.outputVolume)
  void voice.setInputDevice(saved.input)
  void voice.setOutputDevice(saved.output)
  void voice.setCameraDevice(saved.camera)
  for (const [accountId, v] of Object.entries(saved.volumes)) voice.setUserVolume(accountId, v)
  for (const accountId of saved.muted) voice.setUserMuted(accountId, true)
}

loadAudioPreferences()

/** O sistema deixa escolher a saída de áudio? (Electron/Chrome sim; alguns navegadores não) */
export function canChooseAudioOutput(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
}

/**
 * Microfones e saídas disponíveis. Sem permissão de microfone o sistema não
 * informa os nomes: aparecem como "Microfone 1", "Saída 2"...
 */
export async function listAudioDevices(): Promise<{ inputs: AudioDevice[]; outputs: AudioDevice[]; cameras: AudioDevice[] }> {
  const [inputs, outputs, cameras] = await Promise.all([
    voice.listDevices('audioinput'),
    voice.listDevices('audiooutput'),
    voice.listDevices('videoinput')
  ])
  const clean = (list: MediaDeviceInfo[], fallback: string): AudioDevice[] =>
    list
      // 'default' e 'communications' são apelidos do Windows; a opção "Padrão do sistema" já cobre.
      .filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }))
  return { inputs: clean(inputs, 'Microfone'), outputs: clean(outputs, 'Saída'), cameras: clean(cameras, 'Câmera') }
}

export async function selectAudioInput(deviceId: string | null): Promise<void> {
  set({ audioInputId: deviceId })
  save()
  try {
    await voice.setInputDevice(deviceId)
  } catch (err) {
    console.error('[voz] não foi possível trocar o microfone:', err)
    notify('Não foi possível usar esse microfone.')
  }
}

/** Câmera usada ao ligar a câmera na sala (B21); troca na hora se já estiver ligada. */
export async function selectCamera(deviceId: string | null): Promise<void> {
  set({ cameraId: deviceId })
  save()
  try {
    await voice.setCameraDevice(deviceId)
  } catch (err) {
    console.error('[câmera] não foi possível trocar a câmera:', err)
    notify('Não foi possível usar essa câmera.')
  }
}

export async function selectAudioOutput(deviceId: string | null): Promise<void> {
  set({ audioOutputId: deviceId })
  save()
  try {
    await voice.setOutputDevice(deviceId)
  } catch (err) {
    console.error('[voz] não foi possível trocar a saída:', err)
    notify('Não foi possível usar essa saída de áudio.')
  }
}

/** Volume da voz de uma pessoa (0 a 1), lembrado por conta. */
export function setUserVolume(accountId: string, volume: number): void {
  const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1))
  set((st) => {
    const userVolumes = { ...st.userVolumes }
    if (v === 1) delete userVolumes[accountId]
    else userVolumes[accountId] = v
    return { userVolumes }
  })
  save()
  voice.setUserVolume(accountId, v)
}

/** Silencia (ou volta) alguém só para mim. O volume ajustado antes continua guardado. */
export function setUserMuted(accountId: string, muted: boolean): void {
  set((st) => {
    const userMuted = { ...st.userMuted }
    if (muted) userMuted[accountId] = true
    else delete userMuted[accountId]
    return { userMuted }
  })
  save()
  voice.setUserMuted(accountId, muted)
}

/** Volume do microfone (0 a 2 = 0% a 200%). Vale na hora, mesmo dentro da sala. */
export async function setMicGain(gain: number): Promise<void> {
  const v = clampMicGain(gain)
  set({ micGain: v })
  save()
  try {
    await voice.setMicGain(v)
  } catch (err) {
    console.error('[voz] não foi possível ajustar o volume do microfone:', err)
    notify('Não foi possível ajustar o volume do microfone.')
  }
}

/** Volume de saída (0 a 1): voz de todos, áudio da tela, efeitos sonoros e sons da sala. */
export function setOutputVolume(volume: number): void {
  const v = clampOutputVolume(volume)
  set({ outputVolume: v })
  save()
  voice.setOutputVolume(v)
}

/** Liga/desliga e ajusta o volume dos sons de entrar/sair da sala (B16). */
export function setVoiceSounds(change: { enabled?: boolean; volume?: number }): void {
  const patch: { voiceSoundsEnabled?: boolean; voiceSoundsVolume?: number } = {}
  if (typeof change.enabled === 'boolean') patch.voiceSoundsEnabled = change.enabled
  if (typeof change.volume === 'number' && Number.isFinite(change.volume)) {
    patch.voiceSoundsVolume = Math.min(1, Math.max(0, change.volume))
  }
  set(patch)
  save()
}

/** Liga/desliga a supressão de ruído automática (B13). Desligada = microfone cru. */
export async function setNoiseSuppression(enabled: boolean): Promise<void> {
  set({ noiseSuppression: enabled })
  save()
  try {
    await voice.setNoiseSuppression(enabled)
  } catch (err) {
    console.error('[ruído] não foi possível trocar:', err)
    notify('Não foi possível mudar a supressão de ruído.')
  }
}

export function setVoiceLeveler(enabled: boolean): void {
  set({ voiceLeveler: enabled })
  save()
  voice.setLeveler(enabled)
}

export function setVoiceLevelerTarget(target: LevelerTarget): void {
  const t = clampLevelerTarget(target)
  set({ voiceLevelerTarget: t })
  save()
  voice.setLevelerTarget(t)
}

/** Botões de configurações de voz (sala, chamada, "Voz conectada"): abre as configurações em "Voz e vídeo". */
export function openDeviceSettings(): void {
  openSettings('voice')
}
