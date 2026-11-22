import { useState } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Meter, MeterIndicator, MeterLabel, MeterTrack } from '@ui-sdk/react/meter'
import { xpToNext } from '@shared/pokemon/game'
import { openPokemonScreen } from '@/lib/client'
import { useApp } from '@/store'
import type { PokemonScreen } from '@/store/pokemon'
import { PixelIcon, type PixelIconName } from './PixelIcon'
import { AutoPanel } from './AutoPanel'
import { EvolveButton } from './EvolveButton'
import { MapDialog } from './MapDialog'
import { MonCard } from './MonCard'
import { TrainerSprite } from './TrainerSprite'

function MenuButton({ screen, label, icon }: { screen: PokemonScreen; label: string; icon: PixelIconName }) {
  const active = useApp((s) => s.pokemonScreen === screen)
  return (
    <Button aria-pressed={active} onClick={() => openPokemonScreen(screen)} className="px-button text-sm">
      <PixelIcon name={icon} className="size-4" />
      {label}
    </Button>
  )
}

function MapButton() {
  const active = useApp((s) => s.pokemonScreen === 'map')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        aria-pressed={active}
        onClick={() => {
          if (!active) openPokemonScreen('map')
          setOpen(true)
        }}
        className="px-button text-sm"
      >
        <PixelIcon name="map" className="size-4" />
        Mapa
      </Button>
      <MapDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function XpBar({ label, value, max, fill }: { label: string; value: number; max: number; fill: string }) {
  return (
    <Meter value={value} max={max} format={{ style: 'decimal' }} className="flex flex-col gap-1">
      <MeterLabel className="text-xs">
        {label} {value}/{max}
      </MeterLabel>
      <MeterTrack className="px-bar px-bar--thin">
        <MeterIndicator className={`px-fill ${fill}`} />
      </MeterTrack>
    </Meter>
  )
}

export function TrainerCard() {
  const self = useApp((s) => s.self)
  const game = useApp((s) => s.pokemonGame)!
  return (
    <aside aria-label="Treinador" className="flex w-full flex-col gap-3 lg:w-80">
      <div className="px-window px-window--deep flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          <TrainerSprite look={game.trainer.look} className="px-outline size-16 shrink-0 bg-panel" />
          <div className="min-w-0">
            <div className="px-title truncate text-sm">{self?.name ?? 'Treinador'}</div>
            <div className="text-sm">Treinador nv. {game.trainer.level}</div>
            <div aria-label="Dinheiro" className="text-sm font-bold">
              ₽{game.money.toLocaleString('pt-BR')}
            </div>
          </div>
        </div>
        <XpBar label="XP do treinador" value={game.trainer.xp} max={xpToNext(game.trainer.level)} fill="bg-primary" />
      </div>
      <nav aria-label="Funções do treinador" className="grid grid-cols-2 gap-1 lg:grid-cols-1">
        <MapButton />
        <MenuButton screen="bag" label="Mochila" icon="bag" />
        <MenuButton screen="pc" label="Computador" icon="pc" />
        <MenuButton screen="shop" label="Shop" icon="shop" />
        <Button disabled title="Em breve" className="px-button text-sm">
          <PixelIcon name="swords" className="size-4" />
          PvP (em breve)
        </Button>
      </nav>
      <section aria-label="Sua equipe" className="flex flex-col gap-1">
        {game.team.map((m) => (
          <div key={m.uid} className="flex items-center gap-1">
            <MonCard mon={m} className="min-w-0 flex-1" />
            <EvolveButton mon={m} />
          </div>
        ))}
      </section>
      <AutoPanel />
    </aside>
  )
}
