import { Meter, MeterIndicator, MeterLabel, MeterTrack } from '@ui-sdk/react/meter'
import { displayName, maxHp, xpToNext, type Mon } from '@shared/pokemon/game'
import { itemLabel } from '@shared/pokemon/items'
import { cn } from '@/lib/utils'
import { TypeIcon } from './TypeBadge'

const LOW_HP = 0.25

export function MonCard({ mon, back = false, sprite = true, className }: { mon: Mon; back?: boolean; sprite?: boolean; className?: string }) {
  const max = maxHp(mon)
  const name = displayName(mon)
  return (
    <div className={cn('px-window flex items-center gap-3 p-2', className)}>
      {sprite && <img src={back ? mon.species.backSprite : mon.species.sprite} alt="" className="size-16" />}
      <div className="flex min-w-32 flex-1 flex-col gap-1">
        <Meter value={mon.hp} max={max} format={{ style: 'decimal' }} className="flex flex-col gap-1">
          <div className="flex justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1">
              <MeterLabel className="px-title truncate text-sm">{name}</MeterLabel>
              {mon.species.types.map((t) => (
                <TypeIcon key={t} type={t} />
              ))}
            </span>
            <span className="text-sm">Nv.{mon.level}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-primary">HP</span>
            <MeterTrack className="px-bar flex-1">
              <MeterIndicator className={cn('px-fill', mon.hp / max < LOW_HP ? 'bg-destructive' : 'bg-success')} />
            </MeterTrack>
          </div>
        </Meter>
        <Meter value={mon.xp} max={xpToNext(mon.level)} format={{ style: 'decimal' }} aria-label={`XP de ${name}`} className="flex items-center gap-1">
          <span className="text-xs font-bold text-primary">XP</span>
          <MeterTrack className="px-bar px-bar--thin flex-1">
            <MeterIndicator className="px-fill bg-primary" />
          </MeterTrack>
        </Meter>
        <span className="text-xs text-muted-foreground">
          {mon.hp}/{max} HP · {mon.xp}/{xpToNext(mon.level)} XP
          {mon.heldItem && ` · ${itemLabel(mon.heldItem)}`}
        </span>
      </div>
    </div>
  )
}
