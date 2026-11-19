import { useState, type FormEvent } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import type { Message } from '@shared/types'
import { closeSearch, jumpToMessage, loadMoreResults, searchMessages } from '@/lib/client'
import { chatLabel, findDm } from '@/lib/dms'
import { messageSnippet } from '@/lib/search'
import { formatTimestamp } from '@/lib/utils'
import { useApp } from '@/store'

export function SearchBox({ channelId }: { channelId: string }) {
  const [text, setText] = useState('')
  const scoped = useApp((s) => !!s.search?.channelId)

  function submit(e: FormEvent): void {
    e.preventDefault()
    void searchMessages(text, scoped ? channelId : null)
  }

  return (
    <form role="search" onSubmit={submit} className="relative w-56">
      <input
        type="search"
        aria-label="Buscar"
        placeholder="Buscar"
        title='Use de:Nome para filtrar por pessoa'
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-7 w-full rounded bg-background pr-7 pl-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      <Search className="pointer-events-none absolute top-1.5 right-2 size-4 text-muted-foreground" />
    </form>
  )
}

function useChannelLabel(channelId: string): string {
  return useApp((s) => {
    const channel = s.channels.find((c) => c.id === channelId) ?? findDm(s.dms, channelId)?.channel
    return channel ? chatLabel(channel, s.dms) : ''
  })
}

function ResultItem({ message, query }: { message: Message; query: string }) {
  const label = useChannelLabel(message.channelId)
  return (
    <button type="button" onClick={() => void jumpToMessage(message.channelId, message.id)} className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent/50">
      <span className="flex items-baseline gap-2">
        <span className="font-medium" style={{ color: message.author.color }}>
          {message.author.name}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="ml-auto text-xs text-muted-foreground">{formatTimestamp(message.createdAt)}</span>
      </span>
      <span className="block text-sm break-words">
        {messageSnippet(message, query).map((part, i) =>
          part.match ? (
            <mark key={i} className="rounded-sm bg-primary/30 text-accent-foreground">
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          )
        )}
      </span>
    </button>
  )
}

function resultCount(n: number, more: boolean): string {
  const plus = more ? '+' : ''
  return n === 1 ? '1 resultado' : `${n}${plus} resultados`
}

export function SearchPanel({ channelId }: { channelId: string }) {
  const view = useApp((s) => s.search)
  if (!view) return null

  return (
    <aside aria-label="Resultados da busca" className="flex w-96 shrink-0 flex-col border-l border-border bg-sidebar">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="flex-1 text-sm font-semibold text-accent-foreground">
          {view.loading && view.results.length === 0 ? 'Buscando…' : resultCount(view.results.length, view.hasMore)}
        </span>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={!!view.channelId} onChange={(e) => void searchMessages(view.text, e.target.checked ? channelId : null)} />
          Só neste canal
        </label>
        <button type="button" aria-label="Fechar busca" onClick={closeSearch} className="rounded p-1 text-muted-foreground hover:text-accent-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {view.error && (
          <p role="alert" className="px-2 py-1 text-sm text-destructive">
            {view.error}
          </p>
        )}
        {!view.loading && !view.error && view.results.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhum resultado</p>}
        {view.results.map((m) => (
          <ResultItem key={m.id} message={m} query={view.query} />
        ))}
        {view.loading && (
          <div className="flex justify-center py-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-label="Buscando" />
          </div>
        )}
        {view.hasMore && !view.loading && (
          <button type="button" onClick={() => void loadMoreResults()} className="mt-1 w-full rounded-md py-2 text-sm text-primary hover:bg-accent/50">
            Carregar mais
          </button>
        )}
      </div>
    </aside>
  )
}
