import physical from '@/assets/pokemon/category/physical.png'
import special from '@/assets/pokemon/category/special.png'
import type { Move } from '@shared/pokemon/game'
import { cn } from '@/lib/utils'

const ART: Record<Move['category'], string> = { physical, special }

export function CategoryBadge({ category, className }: { category: Move['category']; className?: string }) {
  return <img src={ART[category]} alt="" aria-hidden data-category={category} className={cn('inline-block h-3.5 w-8 shrink-0 [image-rendering:pixelated]', className)} />
}
