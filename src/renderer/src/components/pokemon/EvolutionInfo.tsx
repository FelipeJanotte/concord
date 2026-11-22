import type { ReactNode } from 'react'
import { Button } from '@ui-sdk/react/button'
import { canEvolve, displayName, evolutionStone, type Bag, type Mon } from '@shared/pokemon/game'
import { itemLabel } from '@shared/pokemon/items'
import { evolvePokemon } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { ItemIcon } from './ItemIcon'

const NO_ITEMS: Bag = {}
const artwork = (id: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
const capitalize = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

function Requirement({ met, icon, children }: { met: boolean; icon?: ReactNode; children: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1">
        {icon}
        {children}
      </span>
      <span className={cn('px-outline px-2 text-xs font-bold', met ? 'bg-success text-primary-foreground' : 'bg-destructive text-white')}>{met ? 'OK' : 'FALTA'}</span>
    </li>
  )
}

export function EvolutionInfo({ mon, onEvolved }: { mon: Mon; onEvolved?: () => void }) {
  const bag = useApp((s) => s.pokemonGame?.bag ?? NO_ITEMS)
  const busy = useApp((s) => s.pokemonBusy)
  const evolution = mon.species.evolution
  if (!evolution) return <p className="text-sm">{displayName(mon)} não evolui.</p>
  const stone = evolutionStone(mon)
  const owned = bag[stone] ?? 0

  async function evolve() {
    const res = await evolvePokemon(mon.uid)
    if (res.ok) onEvolved?.()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        <figure className="flex flex-col items-center text-sm">
          <img src={mon.species.sprite} alt="" className="size-20" />
          <figcaption>{displayName(mon)}</figcaption>
        </figure>
        <span aria-hidden className="px-title text-2xl">
          →
        </span>
        <figure className="flex flex-col items-center text-sm">
          <img src={artwork(evolution.id)} alt="" className="size-20" />
          <figcaption>{evolution.name ? capitalize(evolution.name) : 'Próxima forma'}</figcaption>
        </figure>
      </div>
      <ul aria-label="Requisitos" className="px-dialog flex flex-col gap-2 text-sm">
        <Requirement met={mon.level >= evolution.level}>{`Nível ${evolution.level} (atual: ${mon.level})`}</Requirement>
        <Requirement met={owned > 0} icon={<ItemIcon item={stone} />}>{`${itemLabel(stone)} (você tem ${owned})`}</Requirement>
      </ul>
      <p className="text-xs text-muted-foreground">Essa ação não pode ser desfeita.</p>
      <Button className="px-button px-button--success self-end text-sm" disabled={busy || !canEvolve(mon, bag)} onClick={() => void evolve()}>
        Evoluir
      </Button>
    </div>
  )
}
