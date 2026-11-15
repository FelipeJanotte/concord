import { Fragment, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { Hash, Loader2, Upload } from 'lucide-react'
import type { Channel, DmEntry, Message } from '@shared/types'
import { addFiles, loadHistory, loadOlderMessages } from '@/lib/client'
import { chatLabel, findDm } from '@/lib/dms'
import { useCan } from '@/lib/permissions'
import { formatDay, formatTime, formatTimestamp } from '@/lib/utils'
import { useApp } from '@/store'
import { CallButton } from './call/CallButton'
import { CallPanel } from './call/CallPanel'
import { Composer } from './chat/Composer'
import { MessageActions } from './chat/MessageActions'
import { MessageAttachments } from './chat/MessageAttachments'
import { MessageEditor } from './chat/MessageEditor'
import { Reactions } from './chat/Reactions'
import { messageElementId, ReplyQuote } from './chat/ReplyPreview'
import { ToolResultCard } from './tools/ToolResultCard'
import { UserAvatar } from './UserAvatar'

const GROUP_WINDOW_MS = 5 * 60 * 1000

/** A esta distância do topo (px), começa a buscar mensagens mais antigas. */
const LOAD_OLDER_THRESHOLD = 200

const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files')

export function ChatView({ channelId }: { channelId: string }) {
  // canal da comunidade ou conversa privada (B7: os canais `dm` só existem em `dms`)
  const dm = useApp((s) => findDm(s.dms, channelId))
  const channel = useApp((s) => s.channels.find((c) => c.id === channelId)) ?? dm?.channel
  const label = useApp((s) => (channel ? chatLabel(channel, s.dms) : ''))
  const messages = useApp((s) => s.messages[channelId])
  const hasMore = useApp((s) => !!s.hasMoreHistory[channelId])
  const loadingOlder = useApp((s) => !!s.loadingOlder[channelId])
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  /** distância até o fim antes de entrar uma página antiga (para não pular a leitura) */
  const restoreFromBottom = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  // sem permissão de anexar (v2), arrastar arquivo não faz nada
  const canAttach = useCan('attach', channelId)
  const acceptsFiles = (e: DragEvent): boolean => canAttach && hasFiles(e)

  useEffect(() => {
    stickToBottom.current = true
    restoreFromBottom.current = null
  }, [channelId])

  // sem histórico (primeira vez, ou depois de reconectar): busca a página mais recente
  const missing = messages === undefined
  useEffect(() => {
    if (missing && channel) void loadHistory(channelId)
  }, [missing, channelId, !!channel])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (restoreFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFromBottom.current
      restoreFromBottom.current = null
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
    // Página curta que nem enche a tela: não há como rolar, então já busca a próxima.
    if (hasMore && !loadingOlder && el.scrollHeight <= el.clientHeight) requestOlder()
  }, [messages, channelId, hasMore, loadingOlder])

  function requestOlder(): void {
    const el = scrollRef.current
    if (!el || !hasMore || loadingOlder) return
    restoreFromBottom.current = el.scrollHeight - el.scrollTop
    void loadOlderMessages(channelId)
  }

  if (!channel) return null

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/25 px-4 shadow-sm">
        {dm ? (
          <UserAvatar user={dm.other} size="sm" />
        ) : (
          <Hash className="size-6 text-muted-foreground" />
        )}
        <h1 className="font-semibold text-accent-foreground">{dm ? dm.other.name : channel.name}</h1>
        {dm && <CallButton dm={dm} />}
      </header>
      {dm && <CallPanel dm={dm} />}

      <div
        data-testid="chat-drop-zone"
        className="relative flex min-h-0 flex-1 flex-col"
        onDragEnter={(e) => {
          if (!acceptsFiles(e)) return
          e.preventDefault()
          dragDepth.current++
          setDragging(true)
        }}
        onDragOver={(e) => {
          if (acceptsFiles(e)) e.preventDefault()
        }}
        onDragLeave={(e) => {
          if (!acceptsFiles(e)) return
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        }}
        onDrop={(e) => {
          if (!acceptsFiles(e)) return
          e.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          addFiles(channelId, Array.from(e.dataTransfer.files))
        }}
      >
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            if (el.scrollTop < LOAD_OLDER_THRESHOLD) requestOlder()
          }}
          className="min-h-0 flex-1 overflow-y-auto select-text"
        >
          {messages === undefined ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <div className="flex min-h-full flex-col justify-end pb-4">
              {hasMore ? (
                <div className="flex h-12 shrink-0 items-center justify-center text-muted-foreground">
                  {loadingOlder && <Loader2 className="size-5 animate-spin" aria-label="Carregando mensagens antigas" />}
                </div>
              ) : (
                <ChannelWelcome channel={channel} dm={dm} />
              )}
              {messages.map((m, i) => {
                const prev = messages[i - 1]
                const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()
                const compact =
                  !newDay &&
                  !!prev &&
                  prev.author.accountId === m.author.accountId &&
                  m.createdAt - prev.createdAt < GROUP_WINDOW_MS
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

        <Composer channel={channel} />

        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/90 text-accent-foreground">
            <Upload className="size-10 text-primary" />
            <p className="text-lg font-semibold">Solte para enviar em {label}</p>
            <p className="text-sm text-muted-foreground">Até 10 arquivos de 25 MB</p>
          </div>
        )}
      </div>
    </>
  )
}

function ChannelWelcome({ channel, dm }: { channel: Channel; dm?: DmEntry }) {
  if (dm) {
    return (
      <div className="mx-4 mt-6 mb-2">
        <UserAvatar user={dm.other} size="xl" className="mb-3" />
        <h2 className="text-3xl font-bold text-accent-foreground">{dm.other.name}</h2>
        <p className="text-sm text-muted-foreground">
          {dm.other.name}#{dm.other.tag}
        </p>
        <p className="mt-2 text-muted-foreground">Este é o começo da sua conversa com @{dm.other.name}.</p>
      </div>
    )
  }
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

function MessageBody({ message }: { message: Message }) {
  const editing = useApp((s) => s.editingMessageId === message.id)
  // resultado de ferramenta (v4): cartão próprio em vez do texto por extenso
  if (message.kind === 'tool' && message.tool) {
    return (
      <>
        <ToolResultCard message={message} />
        <Reactions message={message} />
      </>
    )
  }
  return (
    <>
      {editing ? (
        <MessageEditor message={message} />
      ) : (
        message.content && (
          <p className="text-[15px] leading-[22px] break-words whitespace-pre-wrap">
            {message.content}
            {message.editedAt && (
              <span className="ml-1 text-[10px] text-muted-foreground" title={`Editada em ${formatTimestamp(message.editedAt)}`}>
                (editada)
              </span>
            )}
          </p>
        )
      )}
      <MessageAttachments attachments={message.attachments ?? []} />
      <Reactions message={message} />
    </>
  )
}

function MessageItem({ message, compact }: { message: Message; compact: boolean }) {
  // Se o autor estiver online, mostra o nome/foto atuais.
  const live = useApp((s) => (compact ? undefined : s.users.find((u) => u.accountId === message.author.accountId)))
  const author = live ?? message.author

  // resposta (B18) nunca fica compacta: a citação vai em cima do nome
  if (compact && !message.replyTo) {
    return (
      <div id={messageElementId(message.id)} className="group relative flex px-4 py-0.5 transition-colors hover:bg-black/[0.06] data-[highlight=true]:bg-primary/15">
        <MessageActions message={message} />
        <span className="w-14 shrink-0 pt-1 pr-2 text-right text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">
          {formatTime(message.createdAt)}
        </span>
        <div className="min-w-0 flex-1">
          <MessageBody message={message} />
        </div>
      </div>
    )
  }

  return (
    <div id={messageElementId(message.id)} className="group relative mt-4 flex gap-4 px-4 py-0.5 transition-colors hover:bg-black/[0.06] data-[highlight=true]:bg-primary/15">
      <MessageActions message={message} />
      <UserAvatar user={author} size="lg" className={message.replyTo ? 'mt-5' : 'mt-0.5'} />
      <div className="min-w-0 flex-1">
        {message.replyTo && <ReplyQuote reply={message.replyTo} />}
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
        <MessageBody message={message} />
      </div>
    </div>
  )
}
