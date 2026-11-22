import { useState, type ReactNode } from 'react'
import { Button } from '@ui-sdk/react/button'
import { displayName, TEAM_LIMIT, type Mon } from '@shared/pokemon/game'
import { depositPokemon, withdrawPokemon } from '@/lib/client'
import { useApp } from '@/store'
import { MonCard } from './MonCard'
import { MonDetailsDialog } from './MonDetailsDialog'
import { PRIMARY_BUTTON } from './styles'

function MonRow({ mon, onPick, action }: { mon: Mon; onPick: (mon: Mon) => void; action: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Button aria-label={`Ver ${displayName(mon)}`} onClick={() => onPick(mon)} className="min-w-0 flex-1 text-left">
        <MonCard mon={mon} className="hover:bg-accent" />
      </Button>
      {action}
    </div>
  )
}

export function PcScreen() {
  const game = useApp((s) => s.pokemonGame)!
  const busy = useApp((s) => s.pokemonBusy)
  const [picked, setPicked] = useState<Mon | null>(null)
  return (
    <div className="flex w-full flex-col gap-4">
      <p className="px-dialog text-sm">
        Clique num pokémon para ver atributos, golpes e evolução.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <section aria-label="Equipe" className="flex flex-col gap-2">
          <h3 className="px-title text-sm">
            Equipe ({game.team.length}/{TEAM_LIMIT})
          </h3>
          {game.team.length <= 1 && <p className="text-xs text-muted-foreground">A equipe precisa de pelo menos 1 pokémon: capture outro para poder guardar.</p>}
          {game.team.map((m) => (
            <MonRow
              key={m.uid}
              mon={m}
              onPick={setPicked}
              action={
                <Button className={PRIMARY_BUTTON} disabled={busy || game.team.length <= 1} onClick={() => void depositPokemon(m.uid)}>
                  Guardar
                </Button>
              }
            />
          ))}
        </section>
        <section aria-label="Computador" className="flex flex-col gap-2">
          <h3 className="px-title text-sm">Computador ({game.pc.length})</h3>
          {game.pc.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pokémon guardado.</p>}
          {game.pc.map((m) => (
            <MonRow
              key={m.uid}
              mon={m}
              onPick={setPicked}
              action={
                <Button className={PRIMARY_BUTTON} disabled={busy || game.team.length >= TEAM_LIMIT} onClick={() => void withdrawPokemon(m.uid)}>
                  Pegar
                </Button>
              }
            />
          ))}
        </section>
      </div>
      {picked && <MonDetailsDialog uid={picked.uid} open onOpenChange={(open) => !open && setPicked(null)} />}
    </div>
  )
}
