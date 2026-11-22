import typeIcons from '@/assets/pokemon/types.png'
import { TYPE_LABELS } from '@shared/pokemon/items'
import { POKEMON_TYPES } from '@shared/pokemon/types'
import { cn } from '@/lib/utils'

const typeLabel = (type: string) => TYPE_LABELS[type] ?? type

export function TypeIcon({ type, className, decorative }: { type: string; className?: string; decorative?: boolean }) {
  const index = Math.max(0, POKEMON_TYPES.indexOf(type as (typeof POKEMON_TYPES)[number]))
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : typeLabel(type)}
      aria-hidden={decorative || undefined}
      data-type={type}
      title={typeLabel(type)}
      className={cn('inline-block size-4 shrink-0 [image-rendering:pixelated]', className)}
      style={{
        backgroundImage: `url(${typeIcons})`,
        backgroundSize: `${POKEMON_TYPES.length * 100}% 100%`,
        backgroundPosition: `${(index * 100) / (POKEMON_TYPES.length - 1)}% 0`
      }}
    />
  )
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="px-outline inline-flex items-center gap-1 bg-panel px-1.5 text-xs font-bold">
      <TypeIcon type={type} />
      {typeLabel(type)}
    </span>
  )
}
