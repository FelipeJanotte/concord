import { useEffect, type CSSProperties } from 'react'
import interiorArt from '@/assets/pokemon/center-interior.png'
import { walk } from '@/lib/client'
import { mapOf, MAPS, sameNeighbors, tileAt, type Dir, type MapId, type Place, type Pos, type Tile } from '@shared/pokemon/map'
import type { GameState } from '@shared/pokemon/game'
import { regionById } from '@shared/pokemon/regions'
import { useApp, type AppState } from '@/store'
import { tilesetOf } from './tilesets'
import { TrainerSprite, useStepFrame } from './TrainerSprite'

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right'
}

const BORDER_VARIANTS = 16
const pixelated = 'size-full select-none [image-rendering:pixelated]'
const HINTS: Record<Place, string> = {
  outdoor: 'Ande com as setas ou WASD. Entre no mato para achar pokémon.',
  center: 'Vá até o balcão para curar a equipe.'
}

function huntText(game: GameState | null, dex: AppState['pokemonDex']): string | null {
  if (!game?.hunt) return null
  const name = dex[game.region]?.find((e) => e.id === game.hunt)?.name ?? `#${game.hunt}`
  return `Caçando ${name} em ${regionById(game.region).label}: todo mato tem ${name}.`
}

function groundStyle(map: MapId, tile: Tile, pos: Pos): CSSProperties {
  const tiles = tilesetOf(map)
  const sheets: Partial<Record<Tile, string | undefined>> = { tree: tiles.obstacle, grass: tiles.encounter, water: tiles.water, building: tiles.building }
  const sheet = sheets[tile]
  if (!sheet) return { backgroundImage: `url(${tiles.ground})`, backgroundSize: '100% 100%' }
  const variant = sameNeighbors(map, pos, tile)
  return {
    backgroundImage: `url(${sheet})`,
    backgroundSize: `${BORDER_VARIANTS * 100}% 100%`,
    backgroundPosition: `${(variant * 100) / (BORDER_VARIANTS - 1)}% 0`
  }
}

const TILE_REM = 2.5

const mapStyle = (map: string[]): CSSProperties => ({
  width: `min(100%, ${map[0].length * TILE_REM}rem)`,
  aspectRatio: `${map[0].length} / ${map.length}`,
  gridTemplateColumns: `repeat(${map[0].length}, 1fr)`,
  gridTemplateRows: `repeat(${map.length}, 1fr)`
})

const cell = ({ x, y }: Pos): CSSProperties => ({ gridColumn: `${x + 1}`, gridRow: `${y + 1}` })

function OutdoorGround({ map }: { map: MapId }) {
  return MAPS[map].flatMap((row, y) =>
    [...row].map((_, x) => {
      const tile = tileAt(map, { x, y })
      return <div key={`${map}-${x}-${y}`} data-tile={tile} className={pixelated} style={{ ...cell({ x, y }), ...groundStyle(map, tile, { x, y }) }} />
    })
  )
}

export function WorldMap() {
  const place = useApp((s) => s.pokemonGame?.place ?? 'outdoor')
  const mapId = useApp((s) => (s.pokemonGame ? mapOf(s.pokemonGame) : 'field'))
  const pos = useApp((s) => s.pokemonGame?.pos)
  const trainer = useApp((s) => s.pokemonGame?.trainer)
  const notice = useApp((s) => s.pokemonNotice)
  const hunt = useApp((s) => huntText(s.pokemonGame, s.pokemonDex))
  const frame = useStepFrame(pos)
  const map = MAPS[mapId]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')
      const dir = KEYS[e.key]
      if (typing || !dir) return
      e.preventDefault()
      void walk(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full justify-center p-1">
        <div
          aria-label={place === 'center' ? 'Centro Pokémon' : 'Mapa'}
          className="px-window grid overflow-hidden p-0"
          style={mapStyle(map)}
        >
          {place === 'center' ? (
            <img src={interiorArt} alt="" className={pixelated} style={{ gridColumn: '1 / -1', gridRow: '1 / -1' }} />
          ) : (
            <OutdoorGround map={mapId} />
          )}
          {pos && trainer && (
            <div role="img" aria-label="Você" className="relative z-10" style={cell(pos)}>
              <TrainerSprite look={trainer.look} facing={trainer.facing} frame={frame} className="absolute bottom-0 -left-1/2 h-[200%] w-[200%]" />
            </div>
          )}
        </div>
      </div>
      <p className="px-dialog text-sm">{notice ?? (place === 'outdoor' && hunt) ?? HINTS[place]}</p>
    </div>
  )
}
