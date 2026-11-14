import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { isInlineImage, type Attachment } from '@shared/types'
import { resolveServerUrl } from '@/lib/client'
import { formatBytes } from '@/lib/format'
import { useApp } from '@/store'
import { ImageLightbox } from './ImageLightbox'

const MAX_W = 400
const MAX_H = 300

/** Tamanho de exibição que cabe em 400×300 mantendo a proporção (reserva o espaço antes de carregar). */
export function fitImage(width: number | null, height: number | null): { width: number; height: number } | null {
  if (!width || !height) return null
  const scale = Math.min(1, MAX_W / width, MAX_H / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  const serverUrl = useApp((s) => s.serverUrl)
  if (attachments.length === 0) return null
  return (
    <div className="mt-1 flex flex-col items-start gap-1.5">
      {attachments.map((a) =>
        isInlineImage(a.contentType) ? (
          <ImageAttachment key={a.id} attachment={a} src={resolveServerUrl(a.url, serverUrl) ?? ''} />
        ) : (
          <FileAttachment key={a.id} attachment={a} href={resolveServerUrl(a.url, serverUrl) ?? ''} />
        )
      )}
    </div>
  )
}

function ImageAttachment({ attachment, src }: { attachment: Attachment; src: string }) {
  const [open, setOpen] = useState(false)
  const size = fitImage(attachment.width, attachment.height)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={attachment.name}
        className="block overflow-hidden rounded-md bg-panel"
        style={size ?? undefined}
      >
        <img
          src={src}
          alt={attachment.name}
          loading="lazy"
          width={size?.width}
          height={size?.height}
          className={size ? 'size-full object-cover' : 'max-h-[300px] max-w-[400px] object-contain'}
        />
      </button>
      <ImageLightbox src={src} name={attachment.name} open={open} onOpenChange={setOpen} />
    </>
  )
}

function FileAttachment({ attachment, href }: { attachment: Attachment; href: string }) {
  return (
    <div className="flex w-full max-w-[420px] items-center gap-3 rounded-md border border-border bg-panel p-3">
      <FileText className="size-8 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <a
          href={href}
          download={attachment.name}
          className="block truncate font-medium text-primary hover:underline"
          title={attachment.name}
        >
          {attachment.name}
        </a>
        <span className="text-xs text-muted-foreground">{formatBytes(attachment.size)}</span>
      </div>
      <a
        href={href}
        download={attachment.name}
        aria-label={`Baixar ${attachment.name}`}
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <Download className="size-5" />
      </a>
    </div>
  )
}
