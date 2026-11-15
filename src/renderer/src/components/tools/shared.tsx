// Peças comuns dos painéis das ferramentas (B10): canal onde postar, erro, botão de sortear e o
// aviso "postado em #canal" com atalho para ver o resultado no chat.
import { useMemo, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { Message } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { openDmChat, selectTextChannel } from '@/lib/client'
import { findDm } from '@/lib/dms'
import { allows } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

export interface PostTarget {
  id: string
  label: string
}

/** Onde dá para postar: canais de texto em que posso mandar mensagem e as conversas privadas. */
export function usePostTargets(): PostTarget[] {
  // os seletores devolvem o que está na store; a lista nova é montada fora (senão re-renderiza sem parar)
  const channels = useApp((s) => s.channels)
  const dms = useApp((s) => s.dms)
  const access = useApp((s) => s.access)
  const me = useApp((s) => s.self?.accountId)
  return useMemo(
    () => [
      ...channels.filter((c) => c.type === 'text' && allows(access, me, 'send', c.id)).map((c) => ({ id: c.id, label: `#${c.name}` })),
      // nas conversas privadas os dois sempre podem mandar mensagem
      ...dms.map((d) => ({ id: d.channel.id, label: `@${d.other.name}` }))
    ],
    [channels, dms, access, me]
  )
}

/** Canal sugerido: o chat que estava aberto antes de abrir a ferramenta (comunidade ou conversa), senão o primeiro. */
export function useDefaultTarget(targets: PostTarget[]): string {
  const community = useApp((s) => (s.view?.kind === 'text' ? s.view.channelId : null))
  const dm = useApp((s) => (s.homeView.kind === 'dm' ? s.homeView.channelId : null))
  for (const id of [community, dm]) if (id && targets.some((t) => t.id === id)) return id
  return targets[0]?.id ?? ''
}

/** Estado do canal escolhido no painel (acompanha a lista se o canal sumir). */
export function usePostTarget(): { targets: PostTarget[]; channelId: string; setChannelId: (id: string) => void } {
  const targets = usePostTargets()
  const fallback = useDefaultTarget(targets)
  const [chosen, setChannelId] = useState<string | null>(null)
  const channelId = chosen && targets.some((t) => t.id === chosen) ? chosen : fallback
  return { targets, channelId, setChannelId }
}

export function ChannelSelect({
  targets,
  value,
  onChange
}: {
  targets: PostTarget[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <Field label="Postar em" htmlFor="tool-channel">
      <select
        id="tool-channel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
        disabled={targets.length === 0}
      >
        {targets.length === 0 && <option value="">Nenhum canal disponível</option>}
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export const selectClass =
  'h-10 w-full rounded-md border border-transparent bg-input px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50'

export function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </Label>
      {children}
    </div>
  )
}

/** Moldura de todo painel: descrição, campos e o rodapé com o botão. */
export function ToolPanel({ description, children }: { description: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 p-6">
      <p className="text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  )
}

/**
 * Roda a ação de postar com estado de "enviando", erro e o último resultado.
 * `run` lança `Error` com a mensagem do servidor (as ações de `lib/actions/tools.ts`).
 */
export function usePost(): {
  busy: boolean
  error: string | null
  posted: Message | null
  post: (run: () => Promise<Message>) => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [posted, setPosted] = useState<Message | null>(null)
  async function post(run: () => Promise<Message>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setPosted(await run())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível postar')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, posted, post }
}

export function SubmitButton({ busy, disabled, children, onClick }: { busy: boolean; disabled?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <Button onClick={onClick} disabled={busy || disabled} className="self-start">
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  )
}

export function ToolError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  )
}

/** "Postado em #canal" + atalho para abrir o chat onde o resultado está. */
export function PostedNotice({ message }: { message: Message | null }) {
  const label = useApp((s) => {
    if (!message) return ''
    const dm = findDm(s.dms, message.channelId)
    if (dm) return `@${dm.other.name}`
    const ch = s.channels.find((c) => c.id === message.channelId)
    return ch ? `#${ch.name}` : 'o canal'
  })
  const isDm = useApp((s) => !!message && !!findDm(s.dms, message.channelId))
  if (!message) return null
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span role="status">Postado em {label}.</span>
      <Button
        variant="link"
        className="h-auto p-0"
        onClick={() => (isDm ? openDmChat(message.channelId) : selectTextChannel(message.channelId))}
      >
        Ver no chat
      </Button>
    </div>
  )
}
