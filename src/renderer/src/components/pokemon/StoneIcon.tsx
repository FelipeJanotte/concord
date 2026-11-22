import stoneSheet from '@/assets/pokemon/stones.png'
import { stoneType, stoneTypes } from '@shared/pokemon/items'
import { POKEMON_TYPES } from '@shared/pokemon/types'
import { cn } from '@/lib/utils'

export function StoneIcon({ item, className }: { item: string; className?: string }) {
  const type = stoneType(item)
  const index = POKEMON_TYPES.indexOf(type as (typeof POKEMON_TYPES)[number])
  if (index < 0) return null
  return (
    <span
      aria-hidden
      data-stone={type}
      title={`Evolui pokémon do tipo ${stoneTypes(item).join(' e ')}`}
      className={cn('inline-block size-6 shrink-0 align-middle [image-rendering:pixelated]', className)}
      style={{
        backgroundImage: `url(${stoneSheet})`,
        backgroundSize: `${POKEMON_TYPES.length * 100}% 100%`,
        backgroundPosition: `${(index * 100) / (POKEMON_TYPES.length - 1)}% 0`
      }}
    />
  )
}
