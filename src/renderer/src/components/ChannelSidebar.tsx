import { useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, HeadphoneOff, Hash, Loader2, Lock, MessageSquare, MicOff, Plus, Settings, Trash2, Volume2, VolumeX } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { canModerate, type Channel, type ChannelType, type VoiceState } from '@shared/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { deleteChannel, joinVoice, moveToVoice, notify, openVoiceChat, selectTextChannel } from '@/lib/client'
import { isPrivateChannel, useCan, useCanAdminister } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { CreateChannelDialog } from './CreateChannelDialog'
import { ChannelPermissionsDialog } from './settings/ChannelPermissionsDialog'
import { CommunitySettingsDialog } from './settings/CommunitySettingsDialog'
import { UserAvatar } from './UserAvatar'
import { MemberContextMenu } from './voice/MemberContextMenu'
import { ServerMutedIcon } from './voice/ModerationMenu'
import { LiveBadge } from './voice/ScreenTile'
import { UserPanel, VoiceStatusPanel } from './UserPanel'

export function ChannelSidebar() {
  const channels = useApp((s) => s.channels)
  const [dialog, setDialog] = useState<{ open: boolean; type: ChannelType }>({ open: false, type: 'text' })
  const [collapsed, setCollapsed] = useState<Record<ChannelType, boolean>>({ text: false, voice: false })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const canManageChannels = useCan('manageChannels')
  const canAdminister = useCanAdminister()

  const textChannels = channels.filter((c) => c.type === 'text')
  const voiceChannels = channels.filter((c) => c.type === 'voice')

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar">
      <header className="flex h-12 shrink-0 items-center border-b border-black/25 px-4 font-semibold text-accent-foreground shadow-sm">
        <span className="flex-1">Concord</span>
        {canAdminister && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSettingsOpen(true)}
                aria-label="Configurações da comunidade"
                className="text-muted-foreground hover:text-accent-foreground"
              >
                <Settings className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Configurações da comunidade</TooltipContent>
          </Tooltip>
        )}
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-2 py-3">
          <ChannelSection
            title="Canais de texto"
            collapsed={collapsed.text}
            onToggle={() => setCollapsed((c) => ({ ...c, text: !c.text }))}
            onAdd={canManageChannels ? () => setDialog({ open: true, type: 'text' }) : undefined}
          >
            {textChannels.map((c) => (
              <TextChannelItem key={c.id} channel={c} />
            ))}
          </ChannelSection>

          <ChannelSection
            title="Canais de voz"
            collapsed={collapsed.voice}
            onToggle={() => setCollapsed((c) => ({ ...c, voice: !c.voice }))}
            onAdd={canManageChannels ? () => setDialog({ open: true, type: 'voice' }) : undefined}
          >
            {voiceChannels.map((c) => (
              <VoiceChannelItem key={c.id} channel={c} />
            ))}
          </ChannelSection>
        </div>
      </ScrollArea>

      <VoiceStatusPanel />
      <UserPanel />

      <CreateChannelDialog
        open={dialog.open}
        defaultType={dialog.type}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
      {canAdminister && <CommunitySettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />}
    </aside>
  )
}

function ChannelSection({
  title,
  collapsed,
  onToggle,
  onAdd,
  children
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
  /** sem a função (sem permissão de gerenciar canais), o botão + some */
  onAdd?: () => void
  children: ReactNode
}) {
  return (
    <section>
      <div className="group flex items-center pr-1 pb-1">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-accent-foreground"
        >
          <ChevronDown className={cn('size-3 transition-transform', collapsed && '-rotate-90')} />
          {title}
        </button>
        {onAdd && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onAdd}
                aria-label="Criar canal"
                className="text-muted-foreground hover:text-accent-foreground"
              >
                <Plus className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Criar canal</TooltipContent>
          </Tooltip>
        )}
      </div>
      {!collapsed && <div className="space-y-0.5">{children}</div>}
    </section>
  )
}

function onActivate(handler: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: handler,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handler()
      }
    }
  }
}

/** Engrenagem (permissões do canal) e lixeira: só para quem gerencia canais. */
function ChannelActions({ channel }: { channel: Channel }) {
  const allowed = useCan('manageChannels')
  const [open, setOpen] = useState(false)
  if (!allowed) return null
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOpen(true)
            }}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Permissões do canal"
            className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent-foreground focus-visible:opacity-100"
          >
            <Settings className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Permissões do canal</TooltipContent>
      </Tooltip>
      <DeleteChannelButton channel={channel} />
      {open && (
        // O diálogo é um portal, mas os eventos dele sobem pela árvore do React até o item do canal:
        // sem isto, clicar no diálogo abriria o canal (ou entraria na sala) e Espaço/Enter acionariam o item.
        <span className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <ChannelPermissionsDialog channel={channel} open={open} onOpenChange={setOpen} />
        </span>
      )}
    </>
  )
}

/** Cadeado ao lado do nome quando o @todos não vê o canal. */
function PrivateBadge({ channelId }: { channelId: string }) {
  const priv = useApp((s) => isPrivateChannel(s.access, channelId))
  if (!priv) return null
  return <Lock className="size-3.5 shrink-0 opacity-60" aria-label="Canal privado" />
}

function DeleteChannelButton({ channel }: { channel: Channel }) {
  function handle(e: MouseEvent) {
    e.stopPropagation()
    const label = channel.type === 'text' ? `#${channel.name}` : channel.name
    if (window.confirm(`Excluir o canal ${label}? Isso não pode ser desfeito.`)) deleteChannel(channel.id)
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handle}
          aria-label="Excluir canal"
          className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Excluir canal</TooltipContent>
    </Tooltip>
  )
}

const itemBase =
  'group relative flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sidebar-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'

function TextChannelItem({ channel }: { channel: Channel }) {
  const active = useApp((s) => s.view?.kind === 'text' && s.view.channelId === channel.id)
  const unread = useApp((s) => !!s.unread[channel.id])

  return (
    <div
      {...onActivate(() => selectTextChannel(channel.id))}
      className={cn(
        itemBase,
        active && 'bg-accent text-accent-foreground hover:bg-accent',
        unread && !active && 'font-semibold text-accent-foreground'
      )}
    >
      {unread && !active && <span className="absolute -left-2 h-2 w-1 rounded-r-full bg-accent-foreground" />}
      <Hash className="size-5 shrink-0 opacity-60" />
      <span className="flex-1 truncate text-[15px]">{channel.name}</span>
      <PrivateBadge channelId={channel.id} />
      <ChannelActions channel={channel} />
    </div>
  )
}

/** Arrastar uma pessoa da lista de uma sala de voz para outra (mover, como no Discord). */
const VOICE_USER_DRAG = 'application/x-concord-voice-user'
const isVoiceUserDrag = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes(VOICE_USER_DRAG)

function VoiceChannelItem({ channel }: { channel: Channel }) {
  const active = useApp((s) => s.view?.kind === 'voice' && s.view.channelId === channel.id)
  const connected = useApp((s) => s.myVoiceChannelId === channel.id)
  const joining = useApp((s) => s.joiningVoice && s.view?.channelId === channel.id)
  const members = useApp(useShallow((s) => s.voice.filter((v) => v.channelId === channel.id)))
  // soltando alguém aqui (moderador arrastando da lista de outra sala)
  const [dropping, setDropping] = useState(false)
  // chat de texto da sala: mensagem nova sem o painel "Chat" aberto
  const unread = useApp((s) => !!s.unread[channel.id])

  return (
    <div
      data-voice-room={channel.id}
      data-drop-target={dropping || undefined}
      onDragOver={(e) => {
        if (!isVoiceUserDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        if (!isVoiceUserDrag(e)) return
        e.preventDefault()
        setDropping(false)
        const userId = e.dataTransfer.getData(VOICE_USER_DRAG)
        if (!userId || members.some((m) => m.userId === userId)) return // soltou na própria sala
        moveToVoice(userId, channel.id).catch((err: unknown) => notify(err instanceof Error ? err.message : 'Não foi possível mover'))
      }}
      className={cn('rounded-md', dropping && 'ring-2 ring-primary')}
    >
      <div
        {...onActivate(() => void joinVoice(channel.id))}
        className={cn(
          itemBase,
          active && 'bg-accent text-accent-foreground hover:bg-accent',
          connected && 'text-accent-foreground',
          unread && 'font-semibold text-accent-foreground'
        )}
      >
        {unread && <span className="absolute -left-2 h-2 w-1 rounded-r-full bg-accent-foreground" />}
        {joining ? (
          <Loader2 className="size-5 shrink-0 animate-spin opacity-60" />
        ) : (
          <Volume2 className={cn('size-5 shrink-0 opacity-60', connected && 'text-success opacity-100')} />
        )}
        <span className="flex-1 truncate text-[15px]">{channel.name}</span>
        <PrivateBadge channelId={channel.id} />
        <VoiceChatShortcut channelId={channel.id} unread={unread} />
        <ChannelActions channel={channel} />
      </div>
      {members.length > 0 && (
        <div className="space-y-0.5 py-1 pl-6">
          {members.map((m) => (
            <VoiceMember key={m.userId} state={m} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Abre o chat de texto da sala sem entrar na voz (sempre à vista com mensagem nova; senão, ao passar o mouse). */
function VoiceChatShortcut({ channelId, unread }: { channelId: string; unread: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation() // não entra na sala
            openVoiceChat(channelId)
          }}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={unread ? 'Abrir o chat da sala (mensagens novas)' : 'Abrir o chat da sala'}
          className={cn(
            'transition-opacity hover:text-accent-foreground focus-visible:opacity-100',
            unread ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <MessageSquare className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Abrir o chat</TooltipContent>
    </Tooltip>
  )
}

function VoiceMember({ state }: { state: VoiceState }) {
  const user = useApp((s) => s.users.find((u) => u.id === state.userId))
  const speaking = useApp((s) => !!s.speaking[state.userId])
  const mutedByMe = useApp((s) => !!user && !!s.userMuted[user.accountId])
  // quem pode moderar a pessoa pode arrastá-la para outra sala (o servidor confere de novo)
  const canMove = useApp((s) => !!user && !!s.access && !!s.self && canModerate(s.access, s.self.accountId, user.accountId))
  if (!user) return null
  return (
    <MemberContextMenu userId={state.userId}>
      <div
        draggable={canMove}
        onDragStart={(e) => {
          e.dataTransfer.setData(VOICE_USER_DRAG, state.userId)
          e.dataTransfer.effectAllowed = 'move'
        }}
        title={canMove ? `Arraste ${user.name} para outra sala para mover` : undefined}
        className={cn('flex h-7 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-accent/40', canMove && 'cursor-grab')}
      >
        <UserAvatar user={user} size="sm" speaking={speaking} />
        <span className={cn('flex-1 truncate', speaking && 'text-accent-foreground')}>{user.name}</span>
        {state.sharing && <LiveBadge />}
        {mutedByMe && <VolumeX className="size-3.5 text-destructive" aria-label="Silenciado por você" />}
        {state.serverMuted && <ServerMutedIcon />}
        {state.deafened ? (
          <HeadphoneOff className="size-3.5 text-destructive" />
        ) : state.muted && !state.serverMuted ? (
          <MicOff className="size-3.5 text-destructive" />
        ) : null}
      </div>
    </MemberContextMenu>
  )
}
