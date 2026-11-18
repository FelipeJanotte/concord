import type { ThumbarAction, ThumbarBridge, ThumbarButton } from '@shared/thumbar'
import { useApp } from '@/store'
import { drawThumbarIcons, type ThumbarIcons } from '../thumbar-icons'
import { get } from '../core'
import { leaveVoice, toggleDeafen, toggleMute } from './voice'

type St = ReturnType<typeof useApp.getState>

interface CallAudio {
  muted: boolean
  deafened: boolean
}

export const thumbarEnv = {
  bridge: (): ThumbarBridge | null => (typeof window !== 'undefined' ? (window.api?.thumbar ?? null) : null),
  drawIcons: drawThumbarIcons
}

const CLICK_ACTIONS: Record<ThumbarAction, () => void> = { mute: toggleMute, deafen: toggleDeafen, leave: leaveVoice }

function callAudio(st: St): CallAudio | null {
  if (!st.myVoiceChannelId) return null
  return { muted: st.muted || st.noMic || !st.voiceCanSpeak, deafened: st.deafened }
}

function buttonsFor(audio: CallAudio, icons: ThumbarIcons): ThumbarButton[] {
  return [
    { action: 'mute', tooltip: audio.muted ? 'Ativar microfone' : 'Silenciar', icon: audio.muted ? icons.micOff : icons.mic },
    {
      action: 'deafen',
      tooltip: audio.deafened ? 'Ativar áudio' : 'Desativar áudio',
      icon: audio.deafened ? icons.headphonesOff : icons.headphones
    },
    { action: 'leave', tooltip: 'Sair da chamada', icon: icons.leave }
  ]
}

let icons: Promise<ThumbarIcons | null> | null = null
let lastAudio: string | null = null
let stop: (() => void) | null = null

async function syncThumbar(bridge: ThumbarBridge): Promise<void> {
  const audio = callAudio(get())
  const key = JSON.stringify(audio)
  if (key === lastAudio) return
  lastAudio = key
  if (!audio) return bridge.setButtons([])
  icons ??= thumbarEnv.drawIcons()
  const drawn = await icons
  if (drawn && lastAudio === key) bridge.setButtons(buttonsFor(audio, drawn))
}

export function startThumbar(): () => void {
  if (stop) return stop
  const bridge = thumbarEnv.bridge()
  if (!bridge) return () => {}
  const sync = (): void => void syncThumbar(bridge)
  const unsubscribe = useApp.subscribe(sync)
  const unClick = bridge.onClick((action) => CLICK_ACTIONS[action]?.())
  sync()
  stop = () => {
    unsubscribe()
    unClick()
    bridge.setButtons([])
    lastAudio = null
    icons = null
    stop = null
  }
  return stop
}
