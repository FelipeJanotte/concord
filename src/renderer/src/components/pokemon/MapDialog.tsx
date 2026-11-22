import { useEffect } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@ui-sdk/react/tabs'
import type { DexEntry } from '@shared/types'
import { isRegionUnlocked, regionById, REGIONS, unlockLevel, type RegionId } from '@shared/pokemon/regions'
import { enterCenter, huntPokemon, loadDex, travelTo } from '@/lib/client'
import { useApp } from '@/store'
import { PokemonDialog } from './PokemonDialog'
import { TypeIcon } from './TypeBadge'
import { PRIMARY_BUTTON, QUIET_BUTTON, TAB, TAB_LIST } from './styles'

const CENTER = 'center'
const sprite = (id: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

function DexRow({ entry, region, onDone }: { entry: DexEntry; region: RegionId; onDone: () => void }) {
  const busy = useApp((s) => s.pokemonBusy)
  const hunting = useApp((s) => s.pokemonGame?.region === region && s.pokemonGame?.hunt === entry.id)

  async function hunt() {
    const res = await huntPokemon(region, entry.id)
    if (res.ok) onDone()
  }

  return (
    <li className="px-window flex items-center gap-2 p-1.5">
      <img src={sprite(entry.id)} alt="" loading="lazy" className="size-12 shrink-0 [image-rendering:pixelated]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{entry.name}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          #{entry.id}
          {entry.types.map((t) => (
            <TypeIcon key={t} type={t} />
          ))}
        </div>
      </div>
      <Button
        aria-label={`Caçar ${entry.name}`}
        aria-pressed={hunting}
        disabled={busy}
        onClick={() => void hunt()}
        className={hunting ? PRIMARY_BUTTON : QUIET_BUTTON}
      >
        {hunting ? 'Caçando' : 'Caçar'}
      </Button>
    </li>
  )
}

function RegionPanel({ region, onDone }: { region: RegionId; onDone: () => void }) {
  const entries = useApp((s) => s.pokemonDex[region])
  const here = useApp((s) => s.pokemonGame?.region === region && s.pokemonGame?.place === 'outdoor')
  const hunting = useApp((s) => s.pokemonGame?.region === region && s.pokemonGame?.hunt !== null)
  const busy = useApp((s) => s.pokemonBusy)

  useEffect(() => {
    void loadDex(region)
  }, [region])

  async function go() {
    const res = await travelTo(region)
    if (res.ok) onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">Escolha um pokémon para caçar: todo mato de {regionById(region).label} terá só ele. Só a primeira forma de cada um aparece, e lendários e míticos não.</p>
        {hunting ? (
          <Button disabled={busy} onClick={() => void go()} className={QUIET_BUTTON}>
            Parar de caçar
          </Button>
        ) : (
          !here && (
            <Button disabled={busy} onClick={() => void go()} className={QUIET_BUTTON}>
              Ir sem caçar
            </Button>
          )
        )}
      </div>
      {!entries ? (
        <p className="text-sm text-muted-foreground">Carregando a Pokédex...</p>
      ) : (
        <ul aria-label={`Pokémon de ${regionById(region).label}`} className="grid max-h-[55vh] gap-1 overflow-y-auto sm:grid-cols-2">
          {entries.map((entry) => (
            <DexRow key={entry.id} entry={entry} region={region} onDone={onDone} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function MapDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const region = useApp((s) => s.pokemonGame?.region ?? 'kanto')
  const trainerLevel = useApp((s) => s.pokemonGame?.trainer.level ?? 1)
  const close = () => onOpenChange(false)

  async function center() {
    const res = await enterCenter()
    if (res.ok) close()
  }

  return (
    <PokemonDialog open={open} onOpenChange={onOpenChange} title="Mapa" wide>
      <Tabs defaultValue={region} className="flex flex-col gap-3">
        <TabsList aria-label="Lugares" className={TAB_LIST}>
          <TabsTab value={CENTER} className={TAB}>
            Centro Pokémon
          </TabsTab>
          {REGIONS.map((r) => {
            const unlocked = isRegionUnlocked(r.id, trainerLevel)
            return (
              <TabsTab key={r.id} value={r.id} disabled={!unlocked} title={unlocked ? undefined : `Liberada no nível ${unlockLevel(r.id)} de treinador`} className={TAB}>
                {r.label}
                {!unlocked && <span className="ml-1 text-xs">({unlockLevel(r.id)})</span>}
              </TabsTab>
            )
          })}
        </TabsList>
        <TabsPanel value={CENTER} className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">No Centro Pokémon o balcão cura a equipe.</p>
          <Button onClick={() => void center()} className={PRIMARY_BUTTON}>
            Entrar no Centro Pokémon
          </Button>
        </TabsPanel>
        {REGIONS.map((r) => (
          <TabsPanel key={r.id} value={r.id}>
            <RegionPanel region={r.id} onDone={close} />
          </TabsPanel>
        ))}
      </Tabs>
    </PokemonDialog>
  )
}
