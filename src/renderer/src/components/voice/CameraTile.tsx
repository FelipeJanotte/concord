// Câmera de uma pessoa na grade da sala (B21): o vídeo ocupa o quadro no lugar da foto.
import { useEffect, useRef } from 'react'
import { attachCamera } from '@/lib/client'
import { cn } from '@/lib/utils'

export function CameraVideo({ userId, name, self = false }: { userId: string; name: string; self?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    return attachCamera(userId, el)
  }, [userId])

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      aria-label={self ? 'Sua câmera' : `Câmera de ${name}`}
      // A própria câmera aparece espelhada (como um espelho), igual aos outros apps de chamada.
      className={cn('absolute inset-0 size-full rounded-lg object-cover', self && '-scale-x-100')}
    />
  )
}
