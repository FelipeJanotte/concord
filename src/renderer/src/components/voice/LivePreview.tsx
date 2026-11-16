import { useEffect, useState } from 'react'
import { SCREEN_PREVIEW_INTERVAL_MS, type ScreenPreviewResult } from '@shared/types'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { fetchScreenPreview } from '@/lib/client'
import { LiveBadge, useScreenLabel } from './ScreenTile'

const OPEN_DELAY_MS = 250

export function LivePreview({ userId }: { userId: string }) {
  const label = useScreenLabel(userId)
  return (
    <HoverCard openDelay={OPEN_DELAY_MS} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="inline-flex cursor-default">
          <LiveBadge />
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-72 space-y-1.5 bg-panel p-2">
        <p className="truncate text-xs font-semibold text-accent-foreground">{label}</p>
        <ScreenPreview userId={userId} label={label} />
      </HoverCardContent>
    </HoverCard>
  )
}

function useLatestPreview(userId: string): ScreenPreviewResult | null {
  const [result, setResult] = useState<ScreenPreviewResult | null>(null)
  useEffect(() => {
    let mounted = true
    const load = (): void => void fetchScreenPreview(userId).then((next) => mounted && setResult(next))
    load()
    const timer = setInterval(load, SCREEN_PREVIEW_INTERVAL_MS)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [userId])
  return result
}

function ScreenPreview({ userId, label }: { userId: string; label: string }) {
  const result = useLatestPreview(userId)
  if (result?.ok && result.image) return <img src={result.image} alt={label} className="aspect-video w-full rounded bg-black object-contain" />
  const text = !result ? 'Carregando prévia...' : result.ok ? 'A prévia aparece em instantes.' : result.error
  return <div className="flex aspect-video w-full items-center justify-center rounded bg-black/40 px-3 text-center text-xs text-muted-foreground">{text}</div>
}
