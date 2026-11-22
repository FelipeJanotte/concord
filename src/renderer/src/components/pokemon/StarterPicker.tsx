import { useState } from 'react'
import { Button } from '@ui-sdk/react/button'
import { STARTERS } from '@shared/pokemon/game'
import { TRAINER_LOOKS, type Gender } from '@shared/pokemon/trainers'
import { chooseStarter } from '@/lib/client'
import { useApp } from '@/store'
import { TrainerSprite } from './TrainerSprite'

const NAMES: Record<number, string> = { 1: 'Bulbasaur', 4: 'Charmander', 7: 'Squirtle' }
const artwork = (id: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
const GROUPS: { gender: Gender; title: string; label: string }[] = [
  { gender: 'male', title: 'Masculinos', label: 'Treinador' },
  { gender: 'female', title: 'Femininos', label: 'Treinadora' }
]

function LookPicker({ onPick }: { onPick: (look: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <h2 className="px-title px-dialog text-lg">Escolha seu treinador</h2>
      {GROUPS.map(({ gender, title, label }) => (
        <section key={gender} aria-label={title} className="flex flex-col items-center gap-2">
          <h3 className="px-title text-sm">{title}</h3>
          <div className="flex flex-wrap justify-center gap-2">
            {TRAINER_LOOKS.filter((l) => l.gender === gender).map((look, i) => (
              <Button key={look.id} aria-label={`${label} ${i + 1}`} onClick={() => onPick(look.id)} className="px-button p-2">
                <TrainerSprite look={look.id} className="size-24" />
              </Button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function StarterPicker() {
  const busy = useApp((s) => s.pokemonBusy)
  const [look, setLook] = useState<string | null>(null)
  if (!look) return <LookPicker onPick={setLook} />
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-3">
        <TrainerSprite look={look} className="size-16" />
        <Button className="px-button text-sm" onClick={() => setLook(null)}>
          Trocar treinador
        </Button>
      </div>
      <h2 className="px-title px-dialog text-lg">Escolha seu primeiro pokémon</h2>
      <div className="flex gap-4">
        {STARTERS.map((id) => (
          <Button key={id} disabled={busy} onClick={() => void chooseStarter(id, look)} className="px-button flex-col p-4">
            <img src={artwork(id)} alt="" className="size-24" />
            {NAMES[id]}
          </Button>
        ))}
      </div>
    </div>
  )
}
