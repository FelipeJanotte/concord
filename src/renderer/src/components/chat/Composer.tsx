import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Paperclip, SendHorizontal } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { EVERYONE_TOKEN, MENTION_EVERYONE, MESSAGE_MAX_LENGTH, mentionToken, type Channel } from '@shared/types'
import { Button } from '@/components/ui/button'
import { addFiles, cancelReply, editLastMessage, musicCommandDraft, notifyTyping, runMusicCommand, sendMessage } from '@/lib/client'
import { chatLabel, findDm } from '@/lib/dms'
import {
  activeMentionQuery,
  candidatesFrom,
  filterCandidates,
  fromEditable,
  insertMention,
  type MentionCandidate,
  type MentionMap
} from '@/lib/mentions'
import { allows, useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { AttachmentPreview } from './AttachmentPreview'
import { CommandHighlight, COMPOSER_TEXT } from './CommandHighlight'
import { MentionMenu } from './MentionMenu'
import { ReplyBanner } from './ReplyPreview'
import { ToolsMenu } from './ToolsMenu'

const EMPTY: never[] = []

/**
 * Quem pode ser mencionado aqui (B19): quem está online e vê o canal (menos eu); numa conversa
 * privada, a outra pessoa. "@todos" só fora de DM e com a permissão `mentionEveryone`.
 */
function useMentionCandidates(channel: Channel): MentionCandidate[] {
  const users = useApp((s) => s.users)
  const access = useApp((s) => s.access)
  const me = useApp((s) => s.self?.accountId)
  const dm = useApp((s) => findDm(s.dms, channel.id))
  const canEveryone = useCan('mentionEveryone')
  return useMemo(() => {
    if (dm) return candidatesFrom([{ accountId: dm.other.id, name: dm.other.name, tag: dm.other.tag }], false)
    const people = users.filter((u) => u.accountId !== me && allows(access, u.accountId, 'view', channel.id))
    return candidatesFrom(people, canEveryone)
  }, [users, access, me, dm, canEveryone, channel.id])
}

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
  const label = useApp((s) => chatLabel(channel, s.dms))
  const canSend = allowedSend && !uploading && (!!value.trim() || ready)
  const replying = useApp((s) => !!s.replyingTo[channel.id])
  // menções (B19): quem pode ser mencionado, o "@algo" sendo digitado e os rótulos já escolhidos
  const candidates = useMentionCandidates(channel)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const chosen = useRef<MentionMap>({})
  const options = mention ? filterCandidates(candidates, mention.query) : []
  const commandDraft = musicCommandDraft(value)

  function trackMention(text: string, caret: number): void {
    const next = activeMentionQuery(text, caret)
    setMention(next)
    if (next?.query !== mention?.query) setActive(0)
  }

  function pickMention(item: MentionCandidate): void {
    const el = ref.current
    if (!el || !mention) return
    const { text, caret } = insertMention(value, mention.start, el.selectionStart ?? value.length, item.label)
    chosen.current[item.label] = item.id === MENTION_EVERYONE ? EVERYONE_TOKEN : mentionToken(item.id)
    setValue(text)
    setMention(null)
    // o cursor vai para depois da menção assim que o texto novo estiver no campo (useLayoutEffect
    // abaixo). Com requestAnimationFrame, o que se digitasse antes do próximo quadro saía fora de ordem.
    pendingCaret.current = caret
  }

  const pendingCaret = useRef<number | null>(null)
  useLayoutEffect(() => {
    const caret = pendingCaret.current
    if (caret === null) return
    pendingCaret.current = null
    ref.current?.setSelectionRange(caret, caret)
  }, [value])

  // clicou em "Responder": o campo ganha o foco para já escrever
  useEffect(() => {
    if (replying) ref.current?.focus()
  }, [replying])

  useEffect(() => {
    setValue('')
    setMention(null)
    chosen.current = {}
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
    if (runMusicCommand(value)) {
      setValue('')
      setMention(null)
      chosen.current = {}
      return
    }
    // os "@Nome" escolhidos viram o token da conta antes de ir para o servidor
    if (sendMessage(channel.id, fromEditable(value, chosen.current))) {
      setValue('')
      setMention(null)
      chosen.current = {}
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // menu de menções aberto: setas escolhem, Enter/Tab confirmam, Esc fecha
    if (options.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault()
        pickMention(options[Math.min(active, options.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMention(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    } else if (e.key === 'Escape' && replying) {
      e.preventDefault()
      cancelReply(channel.id)
    } else if (e.key === 'ArrowUp' && !value && editLastMessage(channel.id)) {
      // seta para cima no campo vazio: edita a minha última mensagem (A15)
      e.preventDefault()
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
      <MentionMenu items={options} active={Math.min(active, Math.max(0, options.length - 1))} onPick={pickMention} />
      <ReplyBanner channelId={channel.id} />
      <div className={cn('rounded-lg bg-composer', replying && 'rounded-t-none')}>
        <AttachmentPreview channelId={channel.id} uploads={uploads} />
        <div className="flex items-end gap-2 py-1.5 pr-1.5 pl-2">
          {channel.type !== 'voice' && <ToolsMenu channelId={channel.id} />}
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
          <div className="relative min-w-0 flex-1">
            {commandDraft && <CommandHighlight {...commandDraft} />}
            <textarea
              ref={ref}
              rows={1}
              maxLength={MESSAGE_MAX_LENGTH}
              value={value}
              placeholder={channel.type === 'dm' ? `Conversar com ${label}` : `Conversar em ${label}`}
              onChange={(e) => {
                setValue(e.target.value)
                trackMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
                if (e.target.value) notifyTyping(channel.id)
              }}
              onSelect={(e) => trackMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
              onBlur={() => setMention(null)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              className={cn(
                COMPOSER_TEXT,
                'block max-h-[200px] w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground',
                commandDraft && 'text-transparent caret-foreground'
              )}
            />
          </div>
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
