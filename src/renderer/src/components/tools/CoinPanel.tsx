// Painel da moeda (B10): quantas moedas e o canal.
import { useState } from 'react'
import { COIN_MAX_COUNT } from '@shared/types'
import { Input } from '@/components/ui/input'
import { flipCoin } from '@/lib/client'
import { PostedResult } from './PostedResult'
import { ChannelSelect, Field, SubmitButton, ToolError, ToolPanel, usePost, usePostTarget } from './shared'

export function CoinPanel() {
  const { targets, channelId, setChannelId } = usePostTarget()
  const [count, setCount] = useState(1)
  const { busy, error, posted, post } = usePost()

  return (
    <ToolPanel description="Cara ou coroa, jogado no servidor e postado no canal.">
      <Field label="Moedas" htmlFor="coin-count">
        <Input
          id="coin-count"
          type="number"
          min={1}
          max={COIN_MAX_COUNT}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-24"
        />
      </Field>
      <ChannelSelect targets={targets} value={channelId} onChange={setChannelId} />
      <ToolError error={error} />
      <SubmitButton busy={busy} disabled={!channelId} onClick={() => void post(() => flipCoin(channelId, count))}>
        {posted ? 'Jogar de novo' : 'Jogar'}
      </SubmitButton>
      <PostedResult message={posted} />
    </ToolPanel>
  )
}
