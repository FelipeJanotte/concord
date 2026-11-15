// Painel "sortear 1" (B10): opções uma por linha (ou importadas de quem está na sala/online) e o canal.
import { useState } from 'react'
import { PICK_MAX_OPTIONS } from '@shared/types'
import { pickOne } from '@/lib/client'
import { PostedResult } from './PostedResult'
import { ImportPeopleButtons } from './people'
import { ChannelSelect, Field, SubmitButton, ToolError, ToolPanel, usePost, usePostTarget } from './shared'

const textareaClass =
  'min-h-32 w-full rounded-md border border-transparent bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function PickPanel() {
  const { targets, channelId, setChannelId } = usePostTarget()
  const [text, setText] = useState('')
  const { busy, error, posted, post } = usePost()
  const filled = text.split(/\r?\n/).filter((l) => l.trim()).length

  function addNames(names: string[]): void {
    const current = new Set(text.split(/\r?\n/).map((l) => l.trim().toLocaleLowerCase('pt-BR')))
    const extra = names.filter((n) => !current.has(n.toLocaleLowerCase('pt-BR')))
    setText([...text.split(/\r?\n/).filter((l) => l.trim()), ...extra].join('\n'))
  }

  return (
    <ToolPanel description="Sorteia uma opção (ou uma pessoa) no servidor e posta no canal.">
      <Field label={`Opções (${filled}/${PICK_MAX_OPTIONS})`} htmlFor="pick-options">
        <textarea
          id="pick-options"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Uma opção por linha\nAna\nBia\nCaio'}
          className={textareaClass}
        />
      </Field>
      <ImportPeopleButtons onImport={(people) => addNames(people.map((p) => p.name))} />
      <ChannelSelect targets={targets} value={channelId} onChange={setChannelId} />
      <ToolError error={error} />
      <SubmitButton busy={busy} disabled={!channelId || filled < 2} onClick={() => void post(() => pickOne(channelId, text))}>
        {posted ? 'Sortear de novo' : 'Sortear'}
      </SubmitButton>
      <PostedResult message={posted} />
    </ToolPanel>
  )
}
