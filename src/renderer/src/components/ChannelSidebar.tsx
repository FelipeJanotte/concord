import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, HeadphoneOff, Hash, Loader2, MicOff, Plus, Trash2, Volume2, VolumeX } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { Channel, ChannelType, VoiceState } from '@shared/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { deleteChannel, joinVoice, selectTextChannel } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { CreateChannelDialog } from './CreateChannelDialog'
import { UserAvatar } from './UserAvatar'
import { MemberContextMenu } from './voice/MemberContextMenu'
import { LiveBadge } from './voice/ScreenTile'
import { UserPanel, VoiceStatusPanel } from './UserPanel'

export function ChannelSidebar() {
  const channels = useApp((s) => s.channels)
  const [dialog, setDialog] = useState<{ open: boolean; type: ChannelType }>({ open: false, type: 'text' })
  const [collapsed, setCollapsed] = useState<Record<ChannelType, boolean>>({ text: false, voice: false })

  const textChannels = channels.filter((c) => c.type === 'text')
  const voiceChannels = channels.filter((c) => c.type === 'voice')

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar">
      <header className="flex h-12 shrink-0 items-center border-b border-black/25 px-4 font-semibold text-accent-foreground shadow-sm">
        Concord
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-2 py-3">
          <ChannelSection
            title="Canais de texto"
            collapsed={collapsed.text}
            onToggle={() => setCollapsed((c) => ({ ...c, text: !c.text }))}
            onAdd={() => setDialog({ open: true, type: 'text' })}
          >
            {textChannels.map((c) => (
              <TextChannelItem key={c.id} channel={c} />
            ))}
          </ChannelSection>

          <ChannelSection
            title="Canais de voz"
            collapsed={collapsed.voice}
            onToggle={() => setCollapsed((c) => ({ ...c, voice: !c.voice }))}
            onAdd={() => setDialog({ open: true, type: 'voice' })}
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
  onAdd: () => void
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
      <DeleteChannelButton channel={channel} />
    </div>
  )
}

function VoiceChannelItem({ channel }: { channel: Channel }) {
  const active = useApp((s) => s.view?.kind === 'voice' && s.view.channelId === channel.id)
  const connected = useApp((s) => s.myVoiceChannelId === channel.id)
  const joining = useApp((s) => s.joiningVoice && s.view?.channelId === channel.id)
  const members = useApp(useShallow((s) => s.voice.filter((v) => v.channelId === channel.id)))

  return (
    <div>
      <div
        {...onActivate(() => void joinVoice(channel.id))}
        className={cn(itemBase, active && 'bg-accent text-accent-foreground hover:bg-accent', connected && 'text-accent-foreground')}
      >
        {joining ? (
          <Loader2 className="size-5 shrink-0 animate-spin opacity-60" />
        ) : (
          <Volume2 className={cn('size-5 shrink-0 opacity-60', connected && 'text-success opacity-100')} />
        )}
        <span className="flex-1 truncate text-[15px]">{channel.name}</span>
        <DeleteChannelButton channel={channel} />
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

function VoiceMember({ state }: { state: VoiceState }) {
  const user = useApp((s) => s.users.find((u) => u.id === state.userId))
  const speaking = useApp((s) => !!s.speaking[state.userId])
  const mutedByMe = useApp((s) => !!user && !!s.userMuted[user.accountId])
  if (!user) return null
  return (
    <MemberContextMenu userId={state.userId}>
      <div className="flex h-7 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-accent/40">
        <UserAvatar user={user} size="sm" speaking={speaking} />
        <span className={cn('flex-1 truncate', speaking && 'text-accent-foreground')}>{user.name}</span>
        {state.sharing && <LiveBadge />}
        {mutedByMe && <VolumeX className="size-3.5 text-destructive" aria-label="Silenciado por você" />}
        {state.deafened ? (
          <HeadphoneOff className="size-3.5 text-destructive" />
        ) : state.muted ? (
          <MicOff className="size-3.5 text-destructive" />
        ) : null}
      </div>
    </MemberContextMenu>
  )
}
