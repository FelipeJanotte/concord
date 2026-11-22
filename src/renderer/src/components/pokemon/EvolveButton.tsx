import { useState } from 'react'
import { Button } from '@ui-sdk/react/button'
import { displayName, type Mon } from '@shared/pokemon/game'
import { EvolutionInfo } from './EvolutionInfo'
import { PokemonDialog } from './PokemonDialog'

export function EvolveButton({ mon }: { mon: Mon }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button aria-label={`Evoluir ${displayName(mon)}`} onClick={() => setOpen(true)} className="px-button px-button--success text-xs">
        Evoluir
      </Button>
      <PokemonDialog open={open} onOpenChange={setOpen} title={`Evoluir ${displayName(mon)}`}>
        <EvolutionInfo mon={mon} onEvolved={() => setOpen(false)} />
      </PokemonDialog>
    </>
  )
}
