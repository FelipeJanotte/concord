import { Volume2, VolumeX } from 'lucide-react'
import { setScreenMuted, setScreenVolume } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

export function ScreenAudioControl({ userId }: { userId: string }) {
  const user = useApp((s) => s.users.find((u) => u.id === userId))
  const hasAudio = useApp((s) => s.screenAudio.includes(userId) && s.self?.id !== userId)
  const accountId = user?.accountId ?? ''
  const pct = useApp((s) => Math.round((s.screenVolumes[accountId] ?? 1) * 100))
  const muted = useApp((s) => !!s.screenMuted[accountId])
  if (!user || !hasAudio) return null

  const screenOf = `tela de ${user.name}`
  const toggleLabel = muted ? `Ativar o som da ${screenOf}` : `Silenciar a ${screenOf}`
  return (
    <div className="flex items-center gap-1 rounded-md bg-white/10 pr-2">
      <button type="button" onClick={() => setScreenMuted(accountId, !muted)} title={toggleLabel} aria-label={toggleLabel} aria-pressed={muted} className="rounded-md p-1.5 hover:bg-white/15 [&_svg]:size-4">
        {muted ? <VolumeX className="text-destructive" /> : <Volume2 />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        aria-label={`Volume da ${screenOf}`}
        title={`${pct}%`}
        onChange={(e) => setScreenVolume(accountId, Number(e.target.value) / 100)}
        className={cn('w-20 accent-primary', muted && 'opacity-50')}
      />
    </div>
  )
}
