import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Paperclip, SendHorizontal } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { MESSAGE_MAX_LENGTH, type Channel } from '@shared/types'
import { Button } from '@/components/ui/button'
import { addFiles, notifyTyping, sendMessage } from '@/lib/client'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { AttachmentPreview } from './AttachmentPreview'

const EMPTY: never[] = []

/** Campo de mensagem: texto, anexos (clipe, colar ou arrastar) e "digitando". */
export function Composer({ channel }: { channel: Channel }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploads = useApp(useShallow((s) => s.drafts[channel.id] ?? EMPTY))
  const uploading = uploads.some((u) => u.status === 'uploading')
  const ready = uploads.some((u) => u.status === 'done')
  const allowedSend = useCan('send', channel.id)
  const allowedAttach = useCan('attach', channel.id)
  const canSend = allowedSend && !uploading && (!!value.trim() || ready)

  useEffect(() => {
    setValue('')
    ref.current?.focus()
  }, [channel.id])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  function send() {
    if (!canSend) return
    if (sendMessage(channel.id, value)) setValue('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.files ?? [])
    if (files.length === 0) return // texto normal: deixa colar
    e.preventDefault()
    if (!allowedAttach) return
    addFiles(channel.id, files)
  }

  if (!allowedSend) {
    return (
      <div className="shrink-0 px-4 pb-6">
        <div className="rounded-lg bg-composer px-4 py-3 text-[15px] text-muted-foreground">
          Você não tem permissão para enviar mensagens neste canal.
        </div>
      </div>
    )
  }

  return (
    <div className="shrink-0 px-4">
      <div className="rounded-lg bg-composer">
        <AttachmentPreview channelId={channel.id} uploads={uploads} />
        <div className="flex items-end gap-2 py-1.5 pr-1.5 pl-2">
          {allowedAttach && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Anexar arquivo"
              title="Anexar arquivo"
              onClick={() => fileInput.current?.click()}
              className="text-muted-foreground hover:text-accent-foreground"
            >
              <Paperclip />
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            data-testid="file-input"
            onChange={(e) => {
              addFiles(channel.id, Array.from(e.target.files ?? []))
              e.target.value = '' // permite escolher o mesmo arquivo de novo
            }}
          />
          <textarea
            ref={ref}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
            value={value}
            placeholder={`Conversar em #${channel.name}`}
            onChange={(e) => {
              setValue(e.target.value)
              if (e.target.value) notifyTyping(channel.id)
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-[22px] outline-none placeholder:text-muted-foreground"
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Enviar"
            title={uploading ? 'Aguarde os anexos terminarem de enviar' : 'Enviar'}
            disabled={!canSend}
            onClick={send}
            className="text-muted-foreground hover:text-accent-foreground"
          >
            <SendHorizontal />
          </Button>
        </div>
      </div>
      <TypingIndicator channelId={channel.id} />
    </div>
  )
}

function TypingIndicator({ channelId }: { channelId: string }) {
  const typing = useApp((s) => s.typing[channelId])
  const selfId = useApp((s) => s.self?.id)
  const [now, setNow] = useState(() => Date.now())

  const hasEntries = !!typing && Object.keys(typing).length > 0
  useEffect(() => {
    if (!hasEntries) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [hasEntries, typing])

  const names = Object.entries(typing ?? {})
    .filter(([id, entry]) => id !== selfId && entry.until > now)
    .map(([, entry]) => entry.name)

  let text = ''
  if (names.length === 1) text = `${names[0]} está digitando...`
  else if (names.length === 2) text = `${names[0]} e ${names[1]} estão digitando...`
  else if (names.length > 2) text = 'Várias pessoas estão digitando...'

  return (
    <div className={cn('flex h-6 items-center gap-1.5 text-xs text-accent-foreground', !text && 'invisible')}>
      <span className="flex gap-0.5">
        <span className="size-1.5 animate-bounce rounded-full bg-accent-foreground [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-accent-foreground [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-accent-foreground" />
      </span>
      <span className="font-medium">{text}</span>
    </div>
  )
}
