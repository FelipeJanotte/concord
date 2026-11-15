// Painel do dado (B10): lados (atalhos d4…d100 ou número), quantidade e canal.
import { useState } from 'react'
import { DICE_MAX_COUNT, DICE_MAX_SIDES, DICE_MIN_SIDES } from '@shared/types'
import { Input } from '@/components/ui/input'
import { rollDice } from '@/lib/client'
import { cn } from '@/lib/utils'
import { PostedResult } from './PostedResult'
import { ChannelSelect, Field, SubmitButton, ToolError, ToolPanel, usePost, usePostTarget } from './shared'

const PRESETS = [4, 6, 8, 10, 12, 20, 100]

export function DicePanel() {
  const { targets, channelId, setChannelId } = usePostTarget()
  const [sides, setSides] = useState(6)
  const [count, setCount] = useState(1)
  const { busy, error, posted, post } = usePost()

  return (
    <ToolPanel description="Rola os dados no servidor e posta o resultado no canal, igual para todo mundo.">
      <Field label="Lados">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={sides === n}
              onClick={() => setSides(n)}
              className={cn(
                'h-9 rounded-md px-3 text-sm font-semibold',
                sides === n ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground hover:bg-accent/80'
              )}
            >
              d{n}
            </button>
          ))}
          <Input
            type="number"
            aria-label="Lados do dado"
            min={DICE_MIN_SIDES}
            max={DICE_MAX_SIDES}
            value={sides}
            onChange={(e) => setSides(Number(e.target.value))}
            className="w-24"
          />
        </div>
      </Field>
      <Field label="Quantidade" htmlFor="dice-count">
        <Input
          id="dice-count"
          type="number"
          min={1}
          max={DICE_MAX_COUNT}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-24"
        />
      </Field>
      <ChannelSelect targets={targets} value={channelId} onChange={setChannelId} />
      <ToolError error={error} />
      <SubmitButton busy={busy} disabled={!channelId} onClick={() => void post(() => rollDice(channelId, sides, count))}>
        {posted ? 'Rolar de novo' : 'Rolar'}
      </SubmitButton>
      <PostedResult message={posted} />
    </ToolPanel>
  )
}
