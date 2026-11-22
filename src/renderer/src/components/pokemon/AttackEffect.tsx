import bug from '@/assets/pokemon/attacks/bug.png'
import dark from '@/assets/pokemon/attacks/dark.png'
import dragon from '@/assets/pokemon/attacks/dragon.png'
import electric from '@/assets/pokemon/attacks/electric.png'
import fairy from '@/assets/pokemon/attacks/fairy.png'
import fighting from '@/assets/pokemon/attacks/fighting.png'
import fire from '@/assets/pokemon/attacks/fire.png'
import flying from '@/assets/pokemon/attacks/flying.png'
import ghost from '@/assets/pokemon/attacks/ghost.png'
import grass from '@/assets/pokemon/attacks/grass.png'
import ground from '@/assets/pokemon/attacks/ground.png'
import ice from '@/assets/pokemon/attacks/ice.png'
import normal from '@/assets/pokemon/attacks/normal.png'
import poison from '@/assets/pokemon/attacks/poison.png'
import psychic from '@/assets/pokemon/attacks/psychic.png'
import rock from '@/assets/pokemon/attacks/rock.png'
import steel from '@/assets/pokemon/attacks/steel.png'
import water from '@/assets/pokemon/attacks/water.png'
import type { Hit } from '@shared/pokemon/game'
import { TYPE_LABELS } from '@shared/pokemon/items'
import type { PokemonType } from '@shared/pokemon/types'
import { cn } from '@/lib/utils'

const SHEETS: Record<PokemonType, string> = {
  normal,
  fire,
  water,
  electric,
  grass,
  ice,
  fighting,
  poison,
  ground,
  flying,
  psychic,
  bug,
  rock,
  ghost,
  dragon,
  dark,
  steel,
  fairy
}

const FROM_ATTACKER: Partial<Record<PokemonType, string>> = {
  water: '-scale-100',
  fire: '-scale-100',
  grass: '-scale-100',
  ice: '-scale-100',
  bug: '-scale-100',
  fighting: '-scale-100',
  fairy: '-scale-100',
  flying: '-scale-x-100'
}

export function AttackEffect({ hit }: { hit: Hit }) {
  const type = hit.type as PokemonType
  const sheet = SHEETS[type] ?? normal
  return (
    <span
      role="img"
      aria-label={`Ataque de ${TYPE_LABELS[hit.type] ?? hit.type}`}
      className={cn('px-attack pointer-events-none absolute top-0 left-1/2 z-20 size-32 -translate-x-1/2 [image-rendering:pixelated]', hit.by === 'wild' && FROM_ATTACKER[type])}
      style={{ backgroundImage: `url(${sheet})` }}
    />
  )
}
