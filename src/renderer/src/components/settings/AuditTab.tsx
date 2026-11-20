import { useEffect, useMemo, useState } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Select, SelectClear, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@ui-sdk/react/select'
import { ChevronDown, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { AUDIT_ACTIONS, type AuditAction, type AuditEntry, type AuditPerson } from '@shared/types'
import { AUDIT_ACTION_LABELS, auditSentence } from '@/lib/audit'
import { loadAudit } from '@/lib/client'
import { useApp } from '@/store'

const errorText = (err: unknown): string => (err instanceof Error ? err.message : 'Não foi possível carregar o registro')

const when = (createdAt: number): string => new Date(createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const TRIGGER =
  'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-placeholder:text-muted-foreground [&_svg]:size-4'
const CONTENT = 'max-h-64 min-w-[var(--anchor-width)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg'
const ITEM = 'cursor-default rounded-sm px-2 py-1.5 text-sm data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:font-medium'
const CLEAR = 'flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-accent-foreground [&_svg]:size-4'

interface Page {
  entries: AuditEntry[]
  hasMore: boolean
}

function usePeople(entries: AuditEntry[]): AuditPerson[] {
  const online = useApp(useShallow((s) => s.users))
  return useMemo(() => {
    const byAccount = new Map<string, AuditPerson>()
    for (const u of online) byAccount.set(u.accountId, { accountId: u.accountId, name: u.name, tag: u.tag })
    for (const e of entries) if (e.actor) byAccount.set(e.actor.accountId, e.actor)
    return [...byAccount.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [online, entries])
}

export function AuditTab() {
  const [actorId, setActorId] = useState<string | null>(null)
  const [action, setAction] = useState<AuditAction | null>(null)
  const [page, setPage] = useState<Page | null>(null)
  const [seen, setSeen] = useState<AuditEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const people = usePeople(seen)

  const filter = useMemo(() => ({ ...(action && { action }), ...(actorId && { actorId }) }), [action, actorId])

  useEffect(() => {
    let active = true
    setPage(null)
    setError(null)
    loadAudit(filter).then(
      (next) => {
        if (!active) return
        setPage(next)
        setSeen((list) => [...list, ...next.entries])
      },
      (err: unknown) => active && setError(errorText(err))
    )
    return () => {
      active = false
    }
  }, [filter])

  async function loadMore(current: Page) {
    setBusy(true)
    setError(null)
    try {
      const next = await loadAudit({ ...filter, before: current.entries[current.entries.length - 1].id })
      setPage({ entries: [...current.entries, ...next.entries], hasMore: next.hasMore })
      setSeen((list) => [...list, ...next.entries])
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select<string> value={actorId} onValueChange={setActorId} placeholder="Todas as pessoas">
          <div className="space-y-1">
            <SelectLabel className="text-xs font-medium text-muted-foreground">Pessoa</SelectLabel>
            <div className="flex gap-1">
              <SelectTrigger className={TRIGGER}>
                <SelectValue />
                <ChevronDown aria-hidden />
              </SelectTrigger>
              <SelectClear aria-label="Todas as pessoas" className={CLEAR}>
                <X aria-hidden />
              </SelectClear>
            </div>
          </div>
          <SelectContent className={CONTENT}>
            {people.map((p) => (
              <SelectItem key={p.accountId} value={p.accountId} label={`${p.name}#${p.tag}`} className={ITEM}>
                {p.name}
                <span className="text-muted-foreground">#{p.tag}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select<AuditAction> value={action} onValueChange={setAction} placeholder="Todas as ações">
          <div className="space-y-1">
            <SelectLabel className="text-xs font-medium text-muted-foreground">Ação</SelectLabel>
            <div className="flex gap-1">
              <SelectTrigger className={TRIGGER}>
                <SelectValue />
                <ChevronDown aria-hidden />
              </SelectTrigger>
              <SelectClear aria-label="Todas as ações" className={CLEAR}>
                <X aria-hidden />
              </SelectClear>
            </div>
          </div>
          <SelectContent className={CONTENT}>
            {AUDIT_ACTIONS.map((a) => (
              <SelectItem key={a} value={a} className={ITEM}>
                {AUDIT_ACTION_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {page === null && !error && <p className="text-sm text-muted-foreground">Carregando registro…</p>}
      {page?.entries.length === 0 && <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>}
      {page && page.entries.length > 0 && (
        <ul className="space-y-1">
          {page.entries.map((entry) => (
            <li key={entry.id} className="flex items-baseline gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/20">
              <span className="min-w-0 flex-1 text-accent-foreground">{auditSentence(entry)}</span>
              <time dateTime={new Date(entry.createdAt).toISOString()} className="shrink-0 text-xs text-muted-foreground">
                {when(entry.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
      {page?.hasMore && (
        <Button
          disabled={busy}
          onClick={() => void loadMore(page)}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-accent-foreground hover:bg-accent/20 data-disabled:opacity-50"
        >
          Carregar mais
        </Button>
      )}
    </div>
  )
}
