import type { VoiceState } from '@shared/types'

export type OwnScreenShare = { kind: 'none' } | { kind: 'browser' } | { kind: 'native'; thumbnail: string }

export const NO_OWN_SCREEN_SHARE: OwnScreenShare = { kind: 'none' }

export interface VoiceSliceState {
  voice: VoiceState[]
  myVoiceChannelId: string | null
  joiningVoice: boolean
  muted: boolean
  deafened: boolean
  noMic: boolean
  speaking: Record<string, boolean>
  sharing: boolean
  screens: string[]
  ownScreenShare: OwnScreenShare
  screenAudio: string[]
  cameraOn: boolean
  cameras: string[]
  screenPickerOpen: boolean
  voiceCanSpeak: boolean
  voiceCanShare: boolean
  voiceCanVideo: boolean
}

export const voiceInitial: VoiceSliceState = {
  voice: [],
  myVoiceChannelId: null,
  joiningVoice: false,
  muted: false,
  deafened: false,
  noMic: false,
  speaking: {},
  sharing: false,
  screens: [],
  ownScreenShare: NO_OWN_SCREEN_SHARE,
  screenAudio: [],
  cameraOn: false,
  cameras: [],
  screenPickerOpen: false,
  voiceCanSpeak: true,
  voiceCanShare: true,
  voiceCanVideo: true
}
