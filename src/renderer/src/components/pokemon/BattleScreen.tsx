import { useState } from 'react'
import { Button } from '@ui-sdk/react/button'
import platformArt from '@/assets/pokemon/platform.png'
import { displayName, isFainted, movesOf, type BattleAction, type Mon, type Move } from '@shared/pokemon/game'
import { itemCategory, itemLabel, TYPE_LABELS } from '@shared/pokemon/items'
import { effectiveness } from '@shared/pokemon/types'
import { battleAction, leaveBattle } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import type { BallThrow, PokemonState } from '@/store/pokemon'
import { AttackEffect } from './AttackEffect'
import { CategoryBadge } from './CategoryBadge'
import { ThrownBall } from './BallSprite'
import { ItemIcon } from './ItemIcon'
import { MonCard } from './MonCard'
import { TypeIcon } from './TypeBadge'

type Menu = 'main' | 'fight' | 'items' | 'switch' | 'revive'

const LOG_LINES = 4
const option = 'px-button justify-start text-sm'
const BATTLE_ITEMS = new Set(['ball', 'potion', 'revive'])
const battleItem = (id: string) => BATTLE_ITEMS.has(itemCategory(id) ?? '')

const CATEGORY = { physical: 'Ataque físico (Attack)', special: 'Ataque especial (Sp. Atk)' }
const factorText = (factor: number) => `${factor.toLocaleString('pt-BR')}x`
const factorMeaning = (factor: number) => (factor === 0 ? 'não afeta' : factor > 1 ? 'super efetivo' : factor < 1 ? 'pouco efetivo' : 'dano normal')

function MoveTips({ move, target }: { move: Move; target: Mon }) {
  const factor = effectiveness(move.type, target.species.types)
  return (
    <dl aria-label={`Dicas de ${move.name}`} className="px-dialog grid h-36 grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Golpe</dt>
      <dd className="font-bold">{move.name}</dd>
      <dt className="text-muted-foreground">Categoria</dt>
      <dd>{CATEGORY[move.category]}</dd>
      <dt className="text-muted-foreground">Tipo</dt>
      <dd className="flex items-center gap-1">
        <TypeIcon type={move.type} />
        {`${TYPE_LABELS[move.type] ?? move.type} · poder ${move.power}`}
        <CategoryBadge category={move.category} />
      </dd>
      <dt className="text-muted-foreground">Contra {displayName(target)}</dt>
      <dd>
        <strong>{factorText(factor)}</strong> ({factorMeaning(factor)})
      </dd>
    </dl>
  )
}

function Fighter({ mon, back, thrown, hit }: { mon: Mon; back?: boolean; thrown?: BallThrow | null; hit: PokemonState['pokemonHit'] }) {
  const strong = hit && hit.factor > 1
  return (
    <div role="group" aria-label={back ? 'Seu pokémon' : 'Selvagem'} className={back ? 'flex items-end gap-2' : 'flex flex-row-reverse items-end gap-2'}>
      <div className="relative flex w-40 shrink-0 flex-col items-center">
        {thrown ? (
          <ThrownBall {...thrown} />
        ) : (
          <img
            key={`sprite-${hit?.seq ?? 'idle'}`}
            src={back ? mon.species.backSprite : mon.species.sprite}
            alt={displayName(mon)}
            data-strong={strong || undefined}
            className={cn('relative z-10 -mb-6 size-32', strong && 'px-hit-shake')}
          />
        )}
        {hit && <AttackEffect key={`effect-${hit.seq}`} hit={hit} />}
        <img src={platformArt} alt="" className="h-10 w-40" />
      </div>
      <MonCard mon={mon} sprite={false} className="max-w-72 flex-1" />
    </div>
  )
}

export function BattleScreen() {
  const game = useApp((s) => s.pokemonGame)!
  const busy = useApp((s) => s.pokemonBusy)
  const thrown = useApp((s) => s.pokemonThrow)
  const hit = useApp((s) => s.pokemonHit)
  const battle = game.battle!
  const [menu, setMenu] = useState<Menu>('main')
  const [hovered, setHovered] = useState<Move | null>(null)
  const [reviveItem, setReviveItem] = useState<string | null>(null)
  const active = game.team.find((m) => m.uid === battle.activeUid)!
  const shown: Menu = battle.mustSwitch ? 'switch' : menu
  const items = Object.entries(game.bag).filter(([id, count]) => battleItem(id) && count > 0)
  const fainted = game.team.filter(isFainted)
  const act = (action: BattleAction) => {
    void battleAction(action)
    setMenu('main')
    setHovered(null)
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
      <div className="px-window px-scene flex flex-col gap-4 p-4">
        <Fighter mon={battle.wild} thrown={thrown} hit={hit?.by === 'player' ? hit : null} />
        <Fighter mon={active} back hit={hit?.by === 'wild' ? hit : null} />
      </div>
      <div className="grid gap-2 md:grid-cols-[3fr_2fr]">
        {hovered && shown === 'fight' ? (
          <MoveTips move={hovered} target={battle.wild} />
        ) : (
          <ol aria-label="Registro da batalha" className="px-dialog px-scroll h-36 overflow-y-auto text-sm leading-relaxed">
            {battle.log.slice(-LOG_LINES).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        )}
        <div className="px-window grid content-start grid-cols-2 gap-1 p-2">
          {battle.outcome && !thrown ? (
            <Button onClick={() => void leaveBattle()} className={`${option} col-span-2`}>
              Voltar ao mapa
            </Button>
          ) : shown === 'main' ? (
            <>
              <Button className={option} onClick={() => setMenu('fight')}>
                Lutar
              </Button>
              <Button className={option} onClick={() => setMenu('items')}>
                Itens
              </Button>
              <Button className={option} onClick={() => setMenu('switch')}>
                Trocar
              </Button>
              <Button className={option} disabled={busy} onClick={() => act({ kind: 'run' })}>
                Fugir
              </Button>
            </>
          ) : (
            <>
              {shown === 'fight' &&
                movesOf(active).map((move, i) => (
                  <Button
                  key={move.name}
                  className={option}
                  disabled={busy}
                  onClick={() => act({ kind: 'fight', move: i })}
                  onPointerEnter={() => setHovered(move)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(move)}
                  onBlur={() => setHovered(null)}
                >
                    <TypeIcon type={move.type} decorative />
                    {move.name} <span className="text-xs opacity-70">{move.power}</span>
                    <CategoryBadge category={move.category} />
                  </Button>
                ))}
              {shown === 'items' && items.length === 0 && <p className="col-span-2 text-sm">Sem pokébolas nem poções. Compre no Shop.</p>}
              {shown === 'items' &&
                items.map(([id, count]) => (
                  <Button
                    key={id}
                    className={`${option} gap-1`}
                    disabled={busy || (itemCategory(id) === 'revive' && fainted.length === 0)}
                    onClick={() => {
                      if (itemCategory(id) !== 'revive') return act({ kind: 'item', item: id })
                      setReviveItem(id)
                      setMenu('revive')
                    }}
                  >
                    <ItemIcon item={id} />
                    {itemLabel(id)} x{count}
                  </Button>
                ))}
              {shown === 'revive' &&
                reviveItem &&
                fainted.map((m) => (
                  <Button key={m.uid} className={option} disabled={busy} onClick={() => act({ kind: 'item', item: reviveItem, target: m.uid })}>
                    Reviver {displayName(m)}
                  </Button>
                ))}
              {shown === 'switch' &&
                game.team.map((m) => (
                  <Button key={m.uid} className={option} disabled={busy || isFainted(m) || m.uid === active.uid} onClick={() => act({ kind: 'switch', uid: m.uid })}>
                    {displayName(m)} Nv. {m.level} ({m.hp} HP)
                  </Button>
                ))}
              {!battle.mustSwitch && (
                <Button className={option} disabled={busy} onClick={() => setMenu('main')}>
                  Voltar
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
