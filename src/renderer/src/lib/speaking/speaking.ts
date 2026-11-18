export const SPEAKING_ON_DB = -50
export const SPEAKING_OFF_DB = -56
export const SPEAKING_HOLD_MS = 300

export interface SpeakingLevel {
  speaking: boolean
  quietMs: number
}

export const SILENT: SpeakingLevel = { speaking: false, quietMs: 0 }
const LOUD: SpeakingLevel = { speaking: true, quietMs: 0 }

export function nextSpeaking(prev: SpeakingLevel, levelDb: number, elapsedMs: number): SpeakingLevel {
  if (levelDb >= SPEAKING_ON_DB) return LOUD
  if (!prev.speaking) return SILENT
  if (levelDb >= SPEAKING_OFF_DB) return LOUD
  const quietMs = prev.quietMs + elapsedMs
  return quietMs >= SPEAKING_HOLD_MS ? SILENT : { speaking: true, quietMs }
}
