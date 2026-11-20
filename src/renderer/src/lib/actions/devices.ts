import { get, notify, set } from '../core'
import { voice } from '../voice'
import { openSettings } from './settings'
import { clampMicGain, clampOutputVolume } from '../mic-gain'
import { clampLevelerTarget, type LevelerTarget } from '../leveler/level'

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
  camera: string | null
  volumes: Record<string, number>
  muted: string[]
  sounds: { enabled: boolean; volume: number }
  noise: boolean
  micGain: number
  outputVolume: number
  leveler: boolean
  levelerTarget: LevelerTarget
  soundboardVolume: number
  screenVolumes: Record<string, number>
  screenMuted: string[]
}

function readVolumes(raw: unknown): Record<string, number> {
  const volumes: Record<string, number> = {}
  if (!raw || typeof raw !== 'object') return volumes
  for (const [id, v] of Object.entries(raw)) {
    if (typeof v === 'number' && v >= 0 && v < 1) volumes[id] = v
  }
  return volumes
}

function readIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && !!id) : []
}

function asFlags(ids: string[]): Record<string, true> {
  return Object.fromEntries(ids.map((id) => [id, true as const]))
}

function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1))
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
    levelerTarget: 'medium',
    soundboardVolume: 1,
    screenVolumes: {},
    screenMuted: []
  }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return empty
    const data = JSON.parse(raw) as Partial<SavedAudio>
    return {
      input: typeof data.input === 'string' && data.input ? data.input : null,
      output: typeof data.output === 'string' && data.output ? data.output : null,
      camera: typeof data.camera === 'string' && data.camera ? data.camera : null,
      volumes: readVolumes(data.volumes),
      muted: readIds(data.muted),
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
      levelerTarget: clampLevelerTarget(data.levelerTarget),
      soundboardVolume: clampOutputVolume(data.soundboardVolume),
      screenVolumes: readVolumes(data.screenVolumes),
      screenMuted: readIds(data.screenMuted)
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
    voiceLevelerTarget,
    soundboardVolume,
    screenVolumes,
    screenMuted
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
        levelerTarget: voiceLevelerTarget,
        soundboardVolume,
        screenVolumes,
        screenMuted: Object.keys(screenMuted)
      })
    )
  } catch {
  }
}

export function loadAudioPreferences(): void {
  const saved = readSaved()
  set({
    audioInputId: saved.input,
    audioOutputId: saved.output,
    cameraId: saved.camera,
    userVolumes: saved.volumes,
    userMuted: asFlags(saved.muted),
    screenVolumes: saved.screenVolumes,
    screenMuted: asFlags(saved.screenMuted),
    voiceSoundsEnabled: saved.sounds.enabled,
    voiceSoundsVolume: saved.sounds.volume,
    noiseSuppression: saved.noise,
    micGain: saved.micGain,
    outputVolume: saved.outputVolume,
    voiceLeveler: saved.leveler,
    voiceLevelerTarget: saved.levelerTarget,
    soundboardVolume: saved.soundboardVolume
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
  for (const [accountId, v] of Object.entries(saved.screenVolumes)) voice.setScreenVolume(accountId, v)
  for (const accountId of saved.screenMuted) voice.setScreenMuted(accountId, true)
}

loadAudioPreferences()

export function canChooseAudioOutput(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
}

export async function listAudioDevices(): Promise<{ inputs: AudioDevice[]; outputs: AudioDevice[]; cameras: AudioDevice[] }> {
  const [inputs, outputs, cameras] = await Promise.all([
    voice.listDevices('audioinput'),
    voice.listDevices('audiooutput'),
    voice.listDevices('videoinput')
  ])
  const clean = (list: MediaDeviceInfo[], fallback: string): AudioDevice[] =>
    list
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

export function setUserVolume(accountId: string, volume: number): void {
  const v = clampVolume(volume)
  set((st) => {
    const userVolumes = { ...st.userVolumes }
    if (v === 1) delete userVolumes[accountId]
    else userVolumes[accountId] = v
    return { userVolumes }
  })
  save()
  voice.setUserVolume(accountId, v)
}

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

export function setScreenVolume(accountId: string, volume: number): void {
  const v = clampVolume(volume)
  set((st) => {
    const screenVolumes = { ...st.screenVolumes }
    if (v === 1) delete screenVolumes[accountId]
    else screenVolumes[accountId] = v
    return { screenVolumes }
  })
  save()
  voice.setScreenVolume(accountId, v)
}

export function setScreenMuted(accountId: string, muted: boolean): void {
  set((st) => {
    const screenMuted = { ...st.screenMuted }
    if (muted) screenMuted[accountId] = true
    else delete screenMuted[accountId]
    return { screenMuted }
  })
  save()
  voice.setScreenMuted(accountId, muted)
}

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

export function setOutputVolume(volume: number): void {
  const v = clampOutputVolume(volume)
  set({ outputVolume: v })
  save()
  voice.setOutputVolume(v)
}

export function setSoundboardVolume(volume: number): void {
  set({ soundboardVolume: clampOutputVolume(volume) })
  save()
}

export function setVoiceSounds(change: { enabled?: boolean; volume?: number }): void {
  const patch: { voiceSoundsEnabled?: boolean; voiceSoundsVolume?: number } = {}
  if (typeof change.enabled === 'boolean') patch.voiceSoundsEnabled = change.enabled
  if (typeof change.volume === 'number' && Number.isFinite(change.volume)) {
    patch.voiceSoundsVolume = Math.min(1, Math.max(0, change.volume))
  }
  set(patch)
  save()
}

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

export function openDeviceSettings(): void {
  openSettings('voice')
}
