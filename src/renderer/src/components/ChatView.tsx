import { Fragment, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { ArrowDown, Hash, Loader2, Pin, Upload, Volume2 } from 'lucide-react'
import { mentionsAccount, type Channel, type DmEntry, type Message } from '@shared/types'
import { addFiles, clearJumpTarget, jumpToMessage, jumpToPresent, loadHistory, loadNewerMessages, loadOlderMessages } from '@/lib/client'
import { chatLabel, findDm } from '@/lib/dms'
import { useCan } from '@/lib/permissions'
import { cn, formatDay, formatTime, formatTimestamp } from '@/lib/utils'
import { useApp } from '@/store'
import { CallButton } from './call/CallButton'
import { CallPanel } from './call/CallPanel'
import { Composer } from './chat/Composer'
import { MessageActions } from './chat/MessageActions'
import { MessageAttachments } from './chat/MessageAttachments'
import { MessageEditor } from './chat/MessageEditor'
import { MessageText } from './chat/MessageText'
import { Reactions } from './chat/Reactions'
import { PinnedMessages } from './chat/PinnedMessages'
import { messageElementId, ReplyQuote, scrollToMessage } from './chat/ReplyPreview'
import { SearchBox, SearchPanel } from './chat/SearchPanel'
import { ToolResultCard } from './tools/ToolResultCard'
import { isMusicBotMessage, MusicBotAvatar, MusicBotName } from './voice/MusicBotReply'
import { UserAvatar } from './UserAvatar'

const GROUP_WINDOW_MS = 5 * 60 * 1000

const senderOf = (message: Message): string => (isMusicBotMessage(message) ? 'music-bot' : message.author.accountId)

/** A esta distância do topo (px), começa a buscar mensagens mais antigas. */
const LOAD_OLDER_THRESHOLD = 200

const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * Chat de um canal: texto da comunidade, conversa privada ou o chat da sala de voz. `embedded` = dentro
 * do painel "Chat" da sala de voz (`VoiceView`): sem o cabeçalho próprio (o painel já tem o seu).
 */
export function ChatView({ channelId, embedded = false }: { channelId: string; embedded?: boolean }) {
  // canal da comunidade ou conversa privada (B7: os canais `dm` só existem em `dms`)
  const dm = useApp((s) => findDm(s.dms, channelId))
  const channel = useApp((s) => s.channels.find((c) => c.id === channelId)) ?? dm?.channel
  const label = useApp((s) => (channel ? chatLabel(channel, s.dms) : ''))
  const messages = useApp((s) => s.messages[channelId])
  const hasMore = useApp((s) => !!s.hasMoreHistory[channelId])
  const loadingOlder = useApp((s) => !!s.loadingOlder[channelId])
  const hasNewer = useApp((s) => !!s.hasNewerHistory[channelId])
  const readMarker = useApp((s) => s.readMarker[channelId])
  const jumpTo = useApp((s) => (s.jumpTarget?.channelId === channelId ? s.jumpTarget.messageId : null))
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
    if (jumpTo && scrollToMessage(jumpTo)) {
      stickToBottom.current = false
      restoreFromBottom.current = null
      clearJumpTarget()
      return
    }
    if (restoreFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFromBottom.current
      restoreFromBottom.current = null
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
    // Página curta que nem enche a tela: não há como rolar, então já busca a próxima.
    if (hasMore && !loadingOlder && el.scrollHeight <= el.clientHeight) requestOlder()
  }, [messages, channelId, hasMore, loadingOlder, jumpTo])

  function requestOlder(): void {
    const el = scrollRef.current
    if (!el || !hasMore || loadingOlder) return
    restoreFromBottom.current = el.scrollHeight - el.scrollTop
    void loadOlderMessages(channelId)
  }

  if (!channel) return null

  return (
    <>
      {!embedded && (
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/25 px-4 shadow-sm">
          {dm ? (
            <UserAvatar user={dm.other} size="sm" />
          ) : (
            <Hash className="size-6 text-muted-foreground" />
          )}
          <h1 className="font-semibold text-accent-foreground">{dm ? dm.other.name : channel.name}</h1>
          {dm && <CallButton dm={dm} />}
          <div className="ml-auto flex items-center gap-2">
            <PinnedMessages channelId={channelId} />
            <SearchBox channelId={channelId} />
          </div>
        </header>
      )}
      {dm && !embedded && <CallPanel dm={dm} />}

      <div className="flex min-h-0 flex-1">
        <div
          data-testid="chat-drop-zone"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col"
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
              const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_OLDER_THRESHOLD
              stickToBottom.current = !hasNewer && el.scrollHeight - el.scrollTop - el.clientHeight < 80
              if (el.scrollTop < LOAD_OLDER_THRESHOLD) requestOlder()
              if (hasNewer && nearBottom) void loadNewerMessages(channelId)
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
                  const firstNew = !!readMarker && prev?.id === readMarker
                  const compact =
                    !newDay &&
                    !firstNew &&
                    !!prev &&
                    senderOf(prev) === senderOf(m) &&
                    prev.kind !== 'pin' &&
                    m.createdAt - prev.createdAt < GROUP_WINDOW_MS
                  return (
                    <Fragment key={m.id}>
                      {newDay && <DayDivider ts={m.createdAt} />}
                      {firstNew && <NewMessagesDivider />}
                      {m.kind === 'pin' ? <PinNotice message={m} /> : <MessageItem message={m} compact={compact} />}
                    </Fragment>
                  )
                })}
              </div>
            )}
          </div>

          {hasNewer && (
            <button
              type="button"
              onClick={() => void jumpToPresent(channelId)}
              className="mx-4 mb-1 flex items-center justify-center gap-1 rounded-md bg-panel py-1 text-sm text-muted-foreground hover:text-accent-foreground"
            >
              <ArrowDown className="size-4" />
              Ir para as mensagens recentes
            </button>
          )}

          <Composer channel={channel} />

          {dragging && (
            <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/90 text-accent-foreground">
              <Upload className="size-10 text-primary" />
              <p className="text-lg font-semibold">Solte para enviar em {label}</p>
              <p className="text-sm text-muted-foreground">Até 10 arquivos de 25 MB</p>
            </div>
          )}
        </div>
        {!embedded && <SearchPanel channelId={channelId} />}
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
  if (channel.type === 'voice') {
    return (
      <div className="mx-4 mt-6 mb-2">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent">
          <Volume2 className="size-7 text-accent-foreground" />
        </div>
        <h2 className="text-xl font-bold text-accent-foreground">Chat de {channel.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Este é o começo do chat da sala de voz {channel.name}. Quem vê a sala vê as mensagens, mesmo sem entrar na voz.</p>
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

function NewMessagesDivider() {
  return (
    <div role="separator" aria-label="Novas mensagens" className="mx-4 mt-3 mb-1 flex items-center gap-2">
      <div className="h-px flex-1 bg-destructive" />
      <span className="rounded bg-destructive px-1.5 text-[10px] font-bold uppercase text-white">Novas mensagens</span>
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
            <MessageText message={message} />
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

function PinNotice({ message }: { message: Message }) {
  const target = message.replyTo && !message.replyTo.deleted ? message.replyTo : null
  return (
    <div id={messageElementId(message.id)} className="group relative mt-4 flex items-center gap-4 px-4 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-black/[0.06] data-[highlight=true]:bg-primary/15">
      <MessageActions message={message} />
      <span className="flex w-10 shrink-0 justify-center">
        <Pin className="size-4" />
      </span>
      <p>
        <span className="font-medium text-accent-foreground">{message.author.name}</span> fixou{' '}
        {target ? (
          <button type="button" onClick={() => void jumpToMessage(message.channelId, target.id)} className="font-medium text-accent-foreground hover:underline">
            uma mensagem
          </button>
        ) : (
          'uma mensagem'
        )}
        . <span className="text-xs">{formatTimestamp(message.createdAt)}</span>
      </p>
    </div>
  )
}

function MessageItem({ message, compact }: { message: Message; compact: boolean }) {
  const bot = isMusicBotMessage(message)
  // Se o autor estiver online, mostra o nome/foto atuais.
  const live = useApp((s) => (compact || bot ? undefined : s.users.find((u) => u.accountId === message.author.accountId)))
  const author = live ?? message.author
  // mencionou a mim (ou @todos): a mensagem fica destacada (B19)
  const mentioned = useApp((s) => message.author.accountId !== s.self?.accountId && mentionsAccount(message.content, s.self?.accountId))
  const highlight = mentioned && 'border-l-2 border-primary bg-primary/10'

  // resposta (B18) nunca fica compacta: a citação vai em cima do nome
  if (compact && !message.replyTo) {
    return (
      <div id={messageElementId(message.id)} className={cn('group relative flex px-4 py-0.5 transition-colors hover:bg-black/[0.06] data-[highlight=true]:bg-primary/15', highlight)}>
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
    <div id={messageElementId(message.id)} className={cn('group relative mt-4 flex gap-4 px-4 py-0.5 transition-colors hover:bg-black/[0.06] data-[highlight=true]:bg-primary/15', highlight)}>
      <MessageActions message={message} />
      {bot ? <MusicBotAvatar className="mt-0.5" /> : <UserAvatar user={author} size="lg" className={message.replyTo ? 'mt-5' : 'mt-0.5'} />}
      <div className="min-w-0 flex-1">
        {message.replyTo && <ReplyQuote reply={message.replyTo} />}
        <div className="flex items-baseline gap-2">
          {bot ? (
            <MusicBotName />
          ) : (
            <span
              className="font-medium"
              style={{ color: author.color }}
              title={author.tag ? `${author.name}#${author.tag}` : author.name}
            >
              {author.name}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{formatTimestamp(message.createdAt)}</span>
        </div>
        <MessageBody message={message} />
      </div>
    </div>
  )
}
