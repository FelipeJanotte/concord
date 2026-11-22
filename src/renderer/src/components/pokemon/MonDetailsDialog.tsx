import { useState } from 'react'
import { Button } from '@ui-sdk/react/button'
import { availableMoves, displayName, MOVE_SLOTS, movesOf, type Mon, type Move } from '@shared/pokemon/game'
import { TYPE_LABELS } from '@shared/pokemon/items'
import { setPokemonMoves } from '@/lib/client'
import { useApp } from '@/store'
import { CategoryBadge } from './CategoryBadge'
import { EvolutionInfo } from './EvolutionInfo'
import { PokemonDialog } from './PokemonDialog'
import { StatsRadar } from './StatsRadar'
import { TypeBadge, TypeIcon } from './TypeBadge'

const typeLabel = (type: string) => TYPE_LABELS[type] ?? type
function MoveDetail({ move }: { move: Move }) {
  return (
    <span className="inline-flex items-center gap-1">
      <TypeIcon type={move.type} decorative />
      {`${typeLabel(move.type)} · poder ${move.power}`}
      <CategoryBadge category={move.category} />
    </span>
  )
}

function MovePicker({ mon, slot, onDone }: { mon: Mon; slot: number; onDone: () => void }) {
  const busy = useApp((s) => s.pokemonBusy)
  const chosen = mon.moves
  const learned = new Set(availableMoves(mon).map((m) => m.name))
  const options = mon.species.moves.filter((m) => !chosen.includes(m.name))

  async function pick(name: string) {
    const next = [...chosen]
    next[slot] = name
    const res = await setPokemonMoves(mon.uid, next.filter(Boolean))
    if (res.ok) onDone()
  }

  return (
    <div className="px-dialog flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Golpes disponíveis</span>
        <Button className="px-button text-xs" onClick={onDone}>
          Fechar
        </Button>
      </div>
      {options.length === 0 && <p className="text-sm text-muted-foreground">Nenhum outro golpe ainda.</p>}
      <ul aria-label="Golpes disponíveis" className="flex max-h-56 flex-col gap-1 overflow-y-auto">
        {options.map((m) => {
          const open = learned.has(m.name)
          return (
            <li key={m.name}>
              <Button className="px-button w-full justify-between text-sm" disabled={busy || !open} onClick={() => void pick(m.name)}>
                <span className="font-medium">{m.name}</span>
                <span className="text-xs">{open ? <MoveDetail move={m} /> : `Nv. ${m.level}`}</span>
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function MoveSlots({ mon }: { mon: Mon }) {
  const [editing, setEditing] = useState<number | null>(null)
  const moves = movesOf(mon)
  const slots = Array.from({ length: MOVE_SLOTS }, (_, i) => moves[i] ?? null)
  return (
    <section aria-label="Golpes" className="flex flex-col gap-2">
      <h3 className="px-title text-sm">Golpes</h3>
      <ul className="grid gap-1">
        {slots.map((move, i) => (
          <li key={i} className="px-window flex items-center gap-2 p-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{move ? move.name : 'Vazio'}</div>
              <div className="text-xs text-muted-foreground">{move ? <MoveDetail move={move} /> : 'Sem golpe'}</div>
            </div>
            <Button aria-label={`Alterar ${move ? move.name : `vaga ${i + 1}`}`} className="px-button text-xs" onClick={() => setEditing(i)}>
              Alterar
            </Button>
          </li>
        ))}
      </ul>
      {editing !== null && <MovePicker mon={mon} slot={editing} onDone={() => setEditing(null)} />}
    </section>
  )
}

export function MonDetailsDialog({ uid, open, onOpenChange }: { uid: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const mon = useApp((s) => [...(s.pokemonGame?.team ?? []), ...(s.pokemonGame?.pc ?? [])].find((m) => m.uid === uid))
  if (!mon) return null
  const name = displayName(mon)
  return (
    <PokemonDialog open={open} onOpenChange={onOpenChange} title={name} wide>
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <img src={mon.species.sprite} alt="" className="px-outline size-28 bg-panel" />
            <div className="flex flex-col gap-1 text-sm">
              <span className="px-title text-lg">{name}</span>
              <span>Nível {mon.level}</span>
              <span className="flex gap-1">
                {mon.species.types.map((t) => (
                  <TypeBadge key={t} type={t} />
                ))}
              </span>
            </div>
          </div>
          <MoveSlots mon={mon} />
        </div>
        <StatsRadar stats={mon.species.stats} label={`Atributos de ${name}`} nature={mon.nature} />
      </div>
      <section aria-label="Evolução" className="mt-5 flex flex-col gap-2">
        <h3 className="px-title text-sm">Evolução</h3>
        <EvolutionInfo mon={mon} />
      </section>
    </PokemonDialog>
  )
}
