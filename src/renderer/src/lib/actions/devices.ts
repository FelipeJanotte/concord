/**
 * Dispositivos de áudio e volume por pessoa (B4). Tudo é preferência desta máquina:
 * fica no localStorage (`concord:audio`) e é aplicado ao VoiceClient ao abrir o app.
 * Nada vai para o servidor.
 */
import { get, notify, set } from '../core'
import { voice } from '../voice'

const STORAGE_KEY = 'concord:audio'

export interface AudioDevice {
  deviceId: string
  label: string
}

interface SavedAudio {
  input: string | null
  output: string | null
  volumes: Record<string, number>
  /** contas silenciadas */
  muted: string[]
  /** sons de entrar/sair da sala (B16) */
  sounds: { enabled: boolean; volume: number }
}

function readSaved(): SavedAudio {
  const empty: SavedAudio = { input: null, output: null, volumes: {}, muted: [], sounds: { enabled: true, volume: 0.5 } }
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
      volumes,
      muted: Array.isArray(data.muted) ? data.muted.filter((id): id is string => typeof id === 'string' && !!id) : [],
      sounds: {
        enabled: typeof data.sounds?.enabled === 'boolean' ? data.sounds.enabled : empty.sounds.enabled,
        volume:
          typeof data.sounds?.volume === 'number' && data.sounds.volume >= 0 && data.sounds.volume <= 1
            ? data.sounds.volume
            : empty.sounds.volume
      }
    }
  } catch {
    return empty
  }
}

function save(): void {
  const { audioInputId, audioOutputId, userVolumes, userMuted, voiceSoundsEnabled, voiceSoundsVolume } = get()
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        input: audioInputId,
        output: audioOutputId,
        volumes: userVolumes,
        muted: Object.keys(userMuted),
        sounds: { enabled: voiceSoundsEnabled, volume: voiceSoundsVolume }
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
    userVolumes: saved.volumes,
    userMuted,
    voiceSoundsEnabled: saved.sounds.enabled,
    voiceSoundsVolume: saved.sounds.volume
  })
  void voice.setInputDevice(saved.input)
  void voice.setOutputDevice(saved.output)
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
export async function listAudioDevices(): Promise<{ inputs: AudioDevice[]; outputs: AudioDevice[] }> {
  const [inputs, outputs] = await Promise.all([voice.listDevices('audioinput'), voice.listDevices('audiooutput')])
  const clean = (list: MediaDeviceInfo[], fallback: string): AudioDevice[] =>
    list
      // 'default' e 'communications' são apelidos do Windows; a opção "Padrão do sistema" já cobre.
      .filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }))
  return { inputs: clean(inputs, 'Microfone'), outputs: clean(outputs, 'Saída') }
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

export function openDeviceSettings(): void {
  set({ deviceSettingsOpen: true })
}

export function closeDeviceSettings(): void {
  set({ deviceSettingsOpen: false })
}
