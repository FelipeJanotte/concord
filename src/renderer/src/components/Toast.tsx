import { useEffect } from 'react'
import { AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

export function Toast() {
  const notice = useApp((s) => s.notice)

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => {
      if (useApp.getState().notice?.id === notice.id) useApp.setState({ notice: null })
    }, 5000)
    return () => window.clearTimeout(t)
  }, [notice])

  if (!notice) return null
  const Icon = notice.kind === 'error' ? AlertCircle : Info

  return (
    <div
      role="status"
      className={cn(
        'animate-in fade-in-0 slide-in-from-bottom-4 fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-popover px-4 py-3 text-sm text-popover-foreground shadow-2xl',
        notice.kind === 'error' && 'border-l-4 border-destructive'
      )}
    >
      <Icon className={cn('size-5', notice.kind === 'error' ? 'text-destructive' : 'text-primary')} />
      <span>{notice.text}</span>
      <button onClick={() => useApp.setState({ notice: null })} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  )
}
