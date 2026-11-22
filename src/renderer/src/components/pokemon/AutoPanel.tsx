import type { ReactNode } from 'react'
import { Checkbox, CheckboxIndicator } from '@ui-sdk/react/checkbox'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import { BALLS, type BallId } from '@shared/pokemon/items'
import { BallIcon } from './BallSprite'
import { setAutoSettings } from '@/lib/client'
import { useApp } from '@/store'

const BALL_IDS = Object.keys(BALLS) as BallId[]

function Toggle({ label, checked, disabled, onChange, hint }: { label: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm data-[disabled=true]:opacity-50" data-disabled={disabled}>
      <span>
        <span className="font-bold">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={(on) => onChange(on)}
        className="px-outline relative h-4 w-8 shrink-0 bg-muted data-checked:bg-success"
      >
        <SwitchThumb className="absolute top-0 left-0 size-4 bg-foreground transition-transform data-checked:translate-x-4" />
      </Switch>
    </label>
  )
}

export function AutoPanel() {
  const auto = useApp((s) => s.pokemonAuto)
  const bag = useApp((s) => s.pokemonGame?.bag)
  const toggleBall = (ball: BallId, on: boolean) => setAutoSettings({ balls: on ? [...auto.balls, ball] : auto.balls.filter((b) => b !== ball) })

  return (
    <section aria-label="Modo AFK" className="px-window flex flex-col gap-3 p-3">
      <h3 className="px-title text-sm">Modo AFK</h3>
      <Toggle label="Auto Fight" hint="Anda pelo mato e luta sozinho" checked={auto.fight} onChange={(fight) => setAutoSettings({ fight })} />
      <Toggle
        label="Auto Catch"
        hint="Joga a pokébola abaixo de 10% do HP"
        checked={auto.catch}
        disabled={!auto.fight}
        onChange={(on) => setAutoSettings({ catch: on })}
      />
      <fieldset disabled={!auto.catch} className="flex flex-col gap-1 disabled:opacity-50">
        <legend className="mb-1 text-xs text-muted-foreground">Pokébolas do Auto Catch</legend>
        {BALL_IDS.map((ball) => (
          <label key={ball} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={auto.balls.includes(ball)}
              disabled={!auto.catch}
              onCheckedChange={(on) => toggleBall(ball, on === true)}
              className="px-outline flex size-4 items-center justify-center bg-background data-checked:bg-primary"
            >
              <CheckboxIndicator className="size-2 bg-primary-foreground" />
            </Checkbox>
            <BallIcon ball={ball} />
            <span className="flex-1">{BALLS[ball].label}</span>
            <span className="text-xs text-muted-foreground">x{bag?.[ball] ?? 0}</span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
