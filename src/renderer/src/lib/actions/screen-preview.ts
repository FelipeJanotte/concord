import { SCREEN_PREVIEW_INTERVAL_MS, type ScreenPreviewResult } from '@shared/types'
import { useApp } from '@/store'
import { get, getSocket } from '../core'
import { snapshotImage, snapshotScreen } from '../screen-snapshot'
import { voice } from '../voice'

export const SCREEN_PREVIEW_FIRST_MS = 1000

const UNAVAILABLE: ScreenPreviewResult = { ok: false, error: 'Prévia indisponível' }

let firstTimer: ReturnType<typeof setTimeout> | null = null
let intervalTimer: ReturnType<typeof setInterval> | null = null

function nativeScreen() {
  return typeof window !== 'undefined' ? window.api?.screen : undefined
}

async function ownScreenImage(): Promise<string | null> {
  const { self, ownScreenShare } = get()
  const native = nativeScreen()
  if (native && ownScreenShare.kind === 'native') return snapshotImage(await native.preview())
  const track = self ? voice.screenMediaTrack(self.id) : undefined
  return track ? snapshotScreen(track) : null
}

async function sendOwnScreenPreview(): Promise<void> {
  if (!get().sharing) return
  try {
    const image = await ownScreenImage()
    if (image && get().sharing) getSocket()?.emit('voice:preview', image)
  } catch (err) {
    console.warn('[tela] não foi possível gerar a prévia:', err)
  }
}

function startPreviewUploads(): void {
  stopPreviewUploads()
  firstTimer = setTimeout(() => void sendOwnScreenPreview(), SCREEN_PREVIEW_FIRST_MS)
  intervalTimer = setInterval(() => void sendOwnScreenPreview(), SCREEN_PREVIEW_INTERVAL_MS)
}

function stopPreviewUploads(): void {
  if (firstTimer) clearTimeout(firstTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  firstTimer = intervalTimer = null
}

useApp.subscribe((state, prev) => {
  if (state.sharing === prev.sharing) return
  if (state.sharing) startPreviewUploads()
  else stopPreviewUploads()
})

export async function fetchScreenPreview(userId: string): Promise<ScreenPreviewResult> {
  const socket = getSocket()
  if (!socket) return UNAVAILABLE
  try {
    return await socket.emitWithAck('voice:preview-get', userId)
  } catch {
    return UNAVAILABLE
  }
}
