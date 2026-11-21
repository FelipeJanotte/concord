import { parseScreenQuality, type ScreenQuality } from '@shared/screen'
import { get, set } from '../core'
import { voice } from '../voice'

const STORAGE_KEY = 'concord:screen-quality'

export function loadScreenQuality(): ScreenQuality {
  try {
    return parseScreenQuality(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return parseScreenQuality(null)
  }
}

function saveScreenQuality(quality: ScreenQuality): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quality))
  } catch {
    return
  }
}

function restoreScreenQuality(): void {
  set({ screenQuality: loadScreenQuality() })
}

restoreScreenQuality()

export async function chooseScreenQuality(quality: ScreenQuality): Promise<void> {
  saveScreenQuality(quality)
  set({ screenQuality: quality })
  if (get().sharing) await voice.setScreenQuality(quality)
}
