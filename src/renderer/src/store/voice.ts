import type { VoiceState } from '@shared/types'

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
  ownScreenThumbnail: string | null
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
  ownScreenThumbnail: null,
  screenAudio: [],
  cameraOn: false,
  cameras: [],
  screenPickerOpen: false,
  voiceCanSpeak: true,
  voiceCanShare: true,
  voiceCanVideo: true
}
