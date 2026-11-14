import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Hash, Loader2, SendHorizontal } from 'lucide-react'
import type { Channel, Message } from '@shared/types'
import { Button } from '@/components/ui/button'
import { notifyTyping, sendMessage } from '@/lib/client'
import { cn, formatDay, formatTime, formatTimestamp } from '@/lib/utils'
import { useApp } from '@/store'
import { UserAvatar } from './UserAvatar'

const GROUP_WINDOW_MS = 5 * 60 * 1000

export function ChatView({ channelId }: { channelId: string }) {
  const channel = useApp((s) => s.channels.find((c) => c.id === channelId))
  const messages = useApp((s) => s.messages[channelId])
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    stickToBottom.current = true
  }, [channelId])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages, channelId])

  if (!channel) return null

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/25 px-4 shadow-sm">
        <Hash className="size-6 text-muted-foreground" />
        <h1 className="font-semibold text-accent-foreground">{channel.name}</h1>
      </header>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="min-h-0 flex-1 overflow-y-auto select-text"
      >
        {messages === undefined ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end pb-4">
            <ChannelWelcome channel={channel} />
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()
              const compact =
                !newDay && !!prev && prev.author.accountId === m.author.accountId && m.createdAt - prev.createdAt < GROUP_WINDOW_MS
              return (
                <Fragment key={m.id}>
                  {newDay && <DayDivider ts={m.createdAt} />}
                  <MessageItem message={m} compact={compact} />
                </Fragment>
              )
            })}
          </div>
        )}
      </div>

      <MessageInput channel={channel} />
    </>
  )
}

function ChannelWelcome({ channel }: { channel: Channel }) {
  return (
    <div className="mx-4 mt-6 mb-2">
      <div className="mb-3 flex size-16 items-center justify-center rounded-full bg-accent">
        <Hash className="size-10 text-accent-foreground" />
      </div>
      <h2 className="text-3xl font-bold text-accent-foreground">Boas-vindas a #{channel.name}!</h2>
      <p className="mt-1 text-muted-foreground">Este é o começo do canal #{channel.name}.</p>
    </div>
  )
}

function DayDivider({ ts }: { ts: number }) {
  return (
    <div className="mx-4 mt-5 mb-1 flex items-center gap-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-semibold text-muted-foreground">{formatDay(ts)}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function MessageItem({ message, compact }: { message: Message; compact: boolean }) {
  // Se o autor estiver online, mostra o nome/foto atuais (a mensagem guarda uma cópia antiga).
  const live = useApp((s) => (compact ? undefined : s.users.find((u) => u.accountId === message.author.accountId)))
  const author = live ?? message.author

  if (compact) {
    return (
      <div className="group flex px-4 py-0.5 hover:bg-black/[0.06]">
        <span className="w-14 shrink-0 pt-1 pr-2 text-right text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">
          {formatTime(message.createdAt)}
        </span>
        <p className="min-w-0 flex-1 text-[15px] leading-[22px] break-words whitespace-pre-wrap">{message.content}</p>
      </div>
    )
  }

  return (
    <div className="group mt-4 flex gap-4 px-4 py-0.5 hover:bg-black/[0.06]">
      <UserAvatar user={author} size="lg" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="font-medium"
            style={{ color: author.color }}
            title={author.tag ? `${author.name}#${author.tag}` : author.name}
          >
            {author.name}
          </span>
          <span className="text-xs text-muted-foreground">{formatTimestamp(message.createdAt)}</span>
        </div>
        <p className="text-[15px] leading-[22px] break-words whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

function MessageInput({ channel }: { channel: Channel }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

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
    if (!value.trim()) return
    sendMessage(channel.id, value)
    setValue('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="shrink-0 px-4">
      <div className="flex items-end gap-2 rounded-lg bg-composer py-1.5 pr-1.5 pl-4">
        <textarea
          ref={ref}
          rows={1}
          maxLength={2000}
          value={value}
          placeholder={`Conversar em #${channel.name}`}
          onChange={(e) => {
            setValue(e.target.value)
            if (e.target.value) notifyTyping(channel.id)
          }}
          onKeyDown={onKeyDown}
          className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-[22px] outline-none placeholder:text-muted-foreground"
        />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Enviar"
          disabled={!value.trim()}
          onClick={send}
          className="text-muted-foreground hover:text-accent-foreground"
        >
          <SendHorizontal />
        </Button>
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
