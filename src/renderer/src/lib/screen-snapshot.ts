import { SCREEN_PREVIEW_MAX_CHARS, SCREEN_PREVIEW_WIDTH } from '@shared/types'

const JPEG_QUALITY = 0.6

export function previewSize(width: number, height: number, maxWidth = SCREEN_PREVIEW_WIDTH): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export async function snapshotScreen(track: MediaStreamTrack): Promise<string | null> {
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = new MediaStream([track])
  try {
    await video.play()
    if (!video.videoWidth || !video.videoHeight) return null
    const size = previewSize(video.videoWidth, video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    canvas.getContext('2d')?.drawImage(video, 0, 0, size.width, size.height)
    const image = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    return image.length <= SCREEN_PREVIEW_MAX_CHARS ? image : null
  } finally {
    video.pause()
    video.srcObject = null
  }
}
