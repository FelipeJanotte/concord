import { DEFAULT_PTT_BINDING, type PttBinding } from '@shared/push-to-talk'

export interface PushToTalkState {
  pushToTalk: boolean
  pttBinding: PttBinding
  pttSounds: boolean
  pttPressed: boolean
  pttCapturing: boolean
  pttAvailable: boolean
}

export const pushToTalkInitial: PushToTalkState = {
  pushToTalk: false,
  pttBinding: DEFAULT_PTT_BINDING,
  pttSounds: true,
  pttPressed: false,
  pttCapturing: false,
  pttAvailable: true
}
