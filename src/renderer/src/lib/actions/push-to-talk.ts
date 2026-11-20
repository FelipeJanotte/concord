import { cleanBinding, DEFAULT_PTT_BINDING, type PttBinding, type PttConfig, type PushToTalkBridge } from '@shared/push-to-talk'
import { get, notify, set } from '../core'
import { voice } from '../voice'
import { chimes } from './voice-sounds'

export const PTT_KEY = 'concord:ptt'

export const pttEnv = {
  bridge: (): PushToTalkBridge | null => (typeof window !== 'undefined' ? (window.api?.pushToTalk ?? null) : null)
}

interface SavedPtt {
  enabled: boolean
  binding: PttBinding
  sounds: boolean
}

function save(): void {
  const { pushToTalk, pttBinding, pttSounds } = get()
  try {
    localStorage.setItem(PTT_KEY, JSON.stringify({ enabled: pushToTalk, binding: pttBinding, sounds: pttSounds } satisfies SavedPtt))
  } catch {
  }
}

function config(): PttConfig {
  const { pushToTalk, pttBinding, pttAvailable } = get()
  return { enabled: pushToTalk && pttAvailable, binding: pttBinding }
}

export function syncMicGate(): void {
  const { pushToTalk, pttPressed } = get()
  voice.setMicGate(!pushToTalk || pttPressed)
}

function sendConfig(): void {
  pttEnv.bridge()?.setConfig(config())
}

export function loadPushToTalkPreferences(): void {
  let raw: Partial<SavedPtt> = {}
  try {
    raw = JSON.parse(localStorage.getItem(PTT_KEY) ?? '{}') as Partial<SavedPtt>
  } catch {
    raw = {}
  }
  set({
    pushToTalk: raw.enabled === true,
    pttBinding: cleanBinding(raw.binding) ?? DEFAULT_PTT_BINDING,
    pttSounds: typeof raw.sounds === 'boolean' ? raw.sounds : true,
    pttPressed: false,
    pttCapturing: false,
    pttAvailable: !!pttEnv.bridge()
  })
  syncMicGate()
  sendConfig()
}

export function handlePttChange(pressed: boolean): void {
  const st = get()
  if (!st.pushToTalk || st.pttPressed === pressed) return
  set({ pttPressed: pressed })
  syncMicGate()
  if (st.pttSounds && st.myVoiceChannelId && !st.muted && !st.deafened && !st.noMic && st.voiceCanSpeak) {
    chimes.play(pressed ? 'ptt-on' : 'ptt-off', { volume: st.voiceSoundsVolume, outputId: st.audioOutputId })
  }
}

export function setPushToTalk(enabled: boolean): void {
  if (enabled && !get().pttAvailable) return notify('Pressione para falar só funciona no app instalado.', 'info')
  set({ pushToTalk: enabled, pttPressed: false })
  save()
  syncMicGate()
  sendConfig()
}

export function setPttSounds(enabled: boolean): void {
  set({ pttSounds: enabled })
  save()
}

export async function choosePttKey(): Promise<void> {
  const bridge = pttEnv.bridge()
  if (!bridge || get().pttCapturing) return
  set({ pttCapturing: true, pttPressed: false })
  syncMicGate()
  try {
    const binding = cleanBinding(await bridge.capture())
    if (binding) {
      set({ pttBinding: binding })
      save()
    }
  } catch (err) {
    console.error('[push-to-talk] não foi possível escolher a tecla:', err)
    notify('Não foi possível escolher a tecla.')
  } finally {
    set({ pttCapturing: false })
    sendConfig()
  }
}

let stop: (() => void) | null = null

export function startPushToTalk(): () => void {
  if (stop) return stop
  loadPushToTalkPreferences()
  const bridge = pttEnv.bridge()
  const unChange = bridge?.onChange(handlePttChange) ?? null
  const unUnavailable =
    bridge?.onUnavailable(() => {
      set({ pttAvailable: false, pushToTalk: false, pttPressed: false })
      syncMicGate()
      notify('Não foi possível ouvir o teclado do sistema: pressione para falar ficou desligado.')
    }) ?? null
  stop = () => {
    unChange?.()
    unUnavailable?.()
    stop = null
  }
  return stop
}
