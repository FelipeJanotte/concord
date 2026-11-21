import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@ui-sdk/react/select'
import { ChevronDown } from 'lucide-react'
import { SCREEN_FPS, SCREEN_RESOLUTIONS, type ScreenFps, type ScreenResolution } from '@shared/screen'
import { chooseScreenQuality } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

const TRIGGER =
  'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2 text-sm text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4'
const CONTENT = 'min-w-[var(--anchor-width)] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg'
const ITEM = 'cursor-default rounded-sm px-2 py-1.5 text-sm data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:font-medium'

const RESOLUTION_LABEL: Record<ScreenResolution, string> = { '720p': '720p', '1080p': '1080p', '1440p': '1440p', original: 'Original' }

export function ScreenQualitySelect({ className }: { className?: string }) {
  const quality = useApp((s) => s.screenQuality)

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      <Select<ScreenResolution> value={quality.resolution} onValueChange={(resolution) => resolution && void chooseScreenQuality({ ...quality, resolution })}>
        <div className="space-y-1">
          <SelectLabel className="text-xs font-medium text-muted-foreground">Resolução</SelectLabel>
          <SelectTrigger className={TRIGGER}>
            <SelectValue />
            <ChevronDown aria-hidden />
          </SelectTrigger>
        </div>
        <SelectContent className={CONTENT}>
          {SCREEN_RESOLUTIONS.map((r) => (
            <SelectItem key={r} value={r} label={RESOLUTION_LABEL[r]} className={ITEM}>
              {RESOLUTION_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select<string> value={String(quality.fps)} onValueChange={(fps) => fps && void chooseScreenQuality({ ...quality, fps: Number(fps) as ScreenFps })}>
        <div className="space-y-1">
          <SelectLabel className="text-xs font-medium text-muted-foreground">Taxa de quadros</SelectLabel>
          <SelectTrigger className={TRIGGER}>
            <SelectValue />
            <ChevronDown aria-hidden />
          </SelectTrigger>
        </div>
        <SelectContent className={CONTENT}>
          {SCREEN_FPS.map((f) => (
            <SelectItem key={f} value={String(f)} label={`${f} fps`} className={ITEM}>
              {f} fps
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
