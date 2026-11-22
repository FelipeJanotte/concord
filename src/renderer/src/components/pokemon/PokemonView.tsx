import type { ReactNode } from 'react'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/700.css'
import './pixel.css'
import { UserPanel, VoiceStatusPanel } from '@/components/UserPanel'
import { useApp } from '@/store'
import type { PokemonScreen } from '@/store/pokemon'
import { BagScreen } from './BagScreen'
import { BattleScreen } from './BattleScreen'
import { PcScreen } from './PcScreen'
import { PixelIcon } from './PixelIcon'
import { ShopScreen } from './ShopScreen'
import { StarterPicker } from './StarterPicker'
import { TrainerCard } from './TrainerCard'
import { WorldMap } from './WorldMap'


const SCREENS: Record<PokemonScreen, () => ReactNode> = {
  map: WorldMap,
  bag: BagScreen,
  pc: PcScreen,
  shop: ShopScreen
}

function Playing() {
  const inBattle = useApp((s) => !!s.pokemonGame?.battle)
  const screen = useApp((s) => s.pokemonScreen)
  const Screen = SCREENS[screen]
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <TrainerCard />
      <div className="flex min-w-0 flex-1 flex-col gap-4">{inBattle ? <BattleScreen /> : <Screen />}</div>
    </div>
  )
}

export function PokemonView() {
  const loaded = useApp((s) => s.pokemonLoaded)
  const hasGame = useApp((s) => !!s.pokemonGame)
  const error = useApp((s) => s.pokemonError)

  return (
    <div className="px-ui flex min-h-0 flex-1 flex-col">
      <header className="px-title flex h-12 shrink-0 items-center gap-2 border-b-4 border-foreground px-4">
        <PixelIcon name="pokeball" className="size-5" />
        Pokémon
      </header>
      <div className="px-scroll relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {error && (
          <p role="alert" className="px-dialog text-sm text-destructive">
            {error}
          </p>
        )}
        {!loaded ? <p className="text-sm text-muted-foreground">Carregando o jogo...</p> : hasGame ? <Playing /> : <StarterPicker />}
      </div>
      <section aria-label="Você" className="w-full shrink-0 border-t border-border lg:w-[22rem]">
        <VoiceStatusPanel />
        <UserPanel />
      </section>
    </div>
  )
}
