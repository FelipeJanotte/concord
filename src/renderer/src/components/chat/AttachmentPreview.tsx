import { AlertCircle, FileText, X } from 'lucide-react'
import { removePendingUpload } from '@/lib/client'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PendingUpload } from '@/store'

/** Anexos preparados no campo de mensagem, com progresso e botão de remover. */
export function AttachmentPreview({ channelId, uploads }: { channelId: string; uploads: PendingUpload[] }) {
  if (uploads.length === 0) return null
  return (
    <ul className="flex gap-2 overflow-x-auto px-1 pt-2 pb-1" aria-label="Anexos">
      {uploads.map((u) => (
        <li
          key={u.localId}
          className={cn(
            'relative flex w-44 shrink-0 flex-col gap-1 rounded-md bg-panel p-2',
            u.status === 'error' && 'ring-1 ring-destructive'
          )}
        >
          <button
            type="button"
            onClick={() => removePendingUpload(channelId, u.localId)}
            aria-label={`Remover ${u.name}`}
            className="absolute top-1 right-1 rounded-full bg-black/40 p-0.5 text-white hover:bg-destructive"
          >
            <X className="size-3.5" />
          </button>
          <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-black/20">
            {u.previewUrl ? (
              <img src={u.previewUrl} alt="" className="size-full object-cover" />
            ) : (
              <FileText className="size-10 text-muted-foreground" />
            )}
          </div>
          <span className="truncate text-xs font-medium" title={u.name}>
            {u.name}
          </span>
          {u.status === 'error' ? (
            <span className="flex items-center gap-1 text-[11px] text-destructive" role="alert">
              <AlertCircle className="size-3 shrink-0" />
              <span className="truncate" title={u.error ?? undefined}>
                {u.error}
              </span>
            </span>
          ) : u.status === 'uploading' ? (
            <div
              className="h-1 overflow-hidden rounded bg-black/30"
              role="progressbar"
              aria-label={`Enviando ${u.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(u.progress * 100)}
            >
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(u.progress * 100)}%` }} />
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">{formatBytes(u.size)}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
