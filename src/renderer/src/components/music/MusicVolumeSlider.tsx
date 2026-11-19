import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from '@ui-sdk/react/slider'
import { Volume2, VolumeX } from 'lucide-react'
import { setUserVolume } from '@/lib/client'
import { cn } from '@/lib/utils'
import { MUSIC_BOT_VOLUME_ID } from '@/lib/voice'
import { useApp } from '@/store'

export function MusicVolumeSlider({ className }: { className: string }) {
  const percent = useApp((s) => Math.round((s.userVolumes[MUSIC_BOT_VOLUME_ID] ?? 1) * 100))
  const muted = useApp((s) => !!s.userMuted[MUSIC_BOT_VOLUME_ID])
  const Icon = muted || percent === 0 ? VolumeX : Volume2

  return (
    <div className="flex items-center gap-2 text-muted-foreground" title={`Volume da música: ${percent}%${muted ? ' (silenciado)' : ''}`}>
      <Icon aria-hidden className="size-4 shrink-0" />
      <Slider
        value={percent}
        min={0}
        max={100}
        step={5}
        onValueChange={(value) => setUserVolume(MUSIC_BOT_VOLUME_ID, (value as number) / 100)}
        className={cn('group', className)}
      >
        <SliderControl className="flex h-5 w-full items-center">
          <SliderTrack className="relative h-1 w-full rounded-full bg-secondary">
            <SliderIndicator className="rounded-full bg-muted-foreground transition-colors group-hover:bg-primary" />
            <SliderThumb
              aria-label="Volume da música"
              className="size-3 rounded-full bg-accent-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 has-[:focus-visible]:opacity-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring data-dragging:opacity-100"
            />
          </SliderTrack>
        </SliderControl>
      </Slider>
    </div>
  )
}
