// Painel da enquete (B10): pergunta, 2 a 10 opções, voto único ou vários e o canal.
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createPoll } from '@/lib/client'
import { PostedResult } from './PostedResult'
import { ChannelSelect, Field, SubmitButton, ToolError, ToolPanel, usePost, usePostTarget } from './shared'

export function PollPanel() {
  const { targets, channelId, setChannelId } = usePostTarget()
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [multiple, setMultiple] = useState(false)
  const { busy, error, posted, post } = usePost()
  const filled = options.filter((o) => o.trim()).length

  const setOption = (i: number, value: string): void => setOptions((prev) => prev.map((o, j) => (j === i ? value : o)))

  async function submit(): Promise<void> {
    await post(() => createPoll(channelId, question, options.filter((o) => o.trim()), multiple))
  }

  return (
    <ToolPanel description="Cria uma enquete no canal. Os votos são anônimos: todo mundo vê só as contagens.">
      <Field label="Pergunta" htmlFor="poll-question">
        <Input
          id="poll-question"
          value={question}
          maxLength={POLL_QUESTION_MAX}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Qual mapa hoje?"
        />
      </Field>
      <Field label={`Opções (${filled}/${POLL_MAX_OPTIONS})`}>
        <div className="flex flex-col gap-2">
          {options.map((option, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={`Opção ${i + 1}`}
                value={option}
                maxLength={POLL_OPTION_MAX}
                onChange={(e) => setOption(i, e.target.value)}
              />
              {options.length > POLL_MIN_OPTIONS && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Tirar a opção ${i + 1}`}
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {options.length < POLL_MAX_OPTIONS && (
            <Button variant="secondary" size="sm" className="self-start" onClick={() => setOptions((prev) => [...prev, ''])}>
              <Plus className="size-4" />
              Adicionar opção
            </Button>
          )}
        </div>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="size-4 accent-primary" />
        Cada pessoa pode marcar várias opções
      </label>
      <ChannelSelect targets={targets} value={channelId} onChange={setChannelId} />
      <ToolError error={error} />
      <SubmitButton busy={busy} disabled={!channelId || !question.trim() || filled < POLL_MIN_OPTIONS} onClick={() => void submit()}>
        Criar enquete
      </SubmitButton>
      <PostedResult message={posted} />
    </ToolPanel>
  )
}
