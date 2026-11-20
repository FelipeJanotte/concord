import { createContext, useContext, useMemo, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Menu, MenuContent, MenuContextTrigger, MenuItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu'
import { ChevronDown, FolderPlus, HeadphoneOff, Hash, Loader2, Lock, MessageSquare, MicOff, Pencil, Plus, Settings, Trash2, Volume2, VolumeX } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { canMoveMember, type Channel, type ChannelCategory, type ChannelLayout, type VoiceState } from '@shared/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CATEGORY_DRAG, CHANNEL_DRAG, dragSource, useDropTarget, type DropEdge } from '@/lib/channel-drag'
import { groupChannels, layoutOf, moveCategory, moveChannel, type CategoryGroup } from '@/lib/channel-layout'
import { deleteChannel, joinVoice, moveToVoice, notify, openVoiceChat, saveChannelLayout, selectTextChannel } from '@/lib/client'
import { loadCollapsedCategories, saveCollapsedCategories } from '@/lib/collapsed-categories'
import { isPrivateChannel, useCan, useCanAdminister } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { CategoryNameDialog, DeleteCategoryDialog } from './CategoryDialogs'
import { CreateChannelDialog } from './CreateChannelDialog'
import { ChannelPermissionsDialog } from './settings/ChannelPermissionsDialog'
import { CommunitySettingsDialog } from './settings/CommunitySettingsDialog'
import { UserAvatar } from './UserAvatar'
import { MuteChannelMenu, useChannelMuted } from './MuteChannelMenu'
import { MemberContextMenu } from './voice/MemberContextMenu'
import { ServerMutedIcon } from './voice/ModerationMenu'
import { LivePreview } from './voice/LivePreview'
import { MusicBotMember } from './voice/MusicPlayer'
import { UserPanel, VoiceStatusPanel } from './UserPanel'

interface Arrange {
  enabled: boolean
  apply: (change: (layout: ChannelLayout) => ChannelLayout) => void
}

const ArrangeContext = createContext<Arrange>({ enabled: false, apply: () => {} })

interface Slot {
  categoryId: string | null
  nextId: string | null
}

const MENU_ITEM =
  'flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:size-4'
const MENU_CONTENT = 'w-52 rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-md'

export function ChannelSidebar() {
  const channels = useApp((s) => s.channels)
  const categories = useApp((s) => s.categories)
  const grouped = useMemo(() => groupChannels(channels, categories), [channels, categories])
  const [channelDialog, setChannelDialog] = useState<{ open: boolean; categoryId: string | null }>({ open: false, categoryId: null })
  const [nameDialog, setNameDialog] = useState<{ open: boolean; category?: ChannelCategory }>({ open: false })
  const [deleting, setDeleting] = useState<ChannelCategory | null>(null)
  const [collapsed, setCollapsed] = useState(loadCollapsedCategories)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const canManageChannels = useCan('manageChannels')
  const canAdminister = useCanAdminister()

  const arrange = useMemo<Arrange>(
    () => ({
      enabled: canManageChannels,
      apply: (change) =>
        void saveChannelLayout(change(layoutOf(grouped))).catch((err: unknown) =>
          notify(err instanceof Error ? err.message : 'Não foi possível mudar a ordem dos canais')
        )
    }),
    [canManageChannels, grouped]
  )

  function toggleCategory(categoryId: string): void {
    const next = collapsed.includes(categoryId) ? collapsed.filter((id) => id !== categoryId) : [...collapsed, categoryId]
    setCollapsed(next)
    saveCollapsedCategories(next)
  }

  const groups = canManageChannels ? grouped.groups : grouped.groups.filter((g) => g.channels.length > 0)

  return (
    <aside data-glass="panel" className="flex min-w-0 flex-1 flex-col bg-sidebar">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/25 px-4 font-semibold text-accent-foreground shadow-sm">
        <span className="flex-1">Concord</span>
        {canManageChannels && (
          <Menu>
            <MenuTrigger aria-label="Criar" title="Criar" className="text-muted-foreground hover:text-accent-foreground data-open:text-accent-foreground">
              <Plus className="size-4" />
            </MenuTrigger>
            <MenuContent align="end" sideOffset={8} data-glass="surface" className={MENU_CONTENT}>
              <MenuItem onSelect={() => setChannelDialog({ open: true, categoryId: null })} className={MENU_ITEM}>
                <Hash aria-hidden />
                Criar canal
              </MenuItem>
              <MenuItem onSelect={() => setNameDialog({ open: true })} className={MENU_ITEM}>
                <FolderPlus aria-hidden />
                Criar categoria
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
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

      <ArrangeContext.Provider value={arrange}>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-2 py-3">
            <UncategorizedChannels channels={grouped.uncategorized} />
            {groups.map((group, i) => (
              <CategorySection
                key={group.category.id}
                group={group}
                nextCategoryId={groups[i + 1]?.category.id ?? null}
                collapsed={collapsed.includes(group.category.id)}
                onToggle={() => toggleCategory(group.category.id)}
                onAddChannel={() => setChannelDialog({ open: true, categoryId: group.category.id })}
                onRename={() => setNameDialog({ open: true, category: group.category })}
                onDelete={() => setDeleting(group.category)}
              />
            ))}
          </div>
        </ScrollArea>
      </ArrangeContext.Provider>

      <VoiceStatusPanel />
      <UserPanel />

      <CreateChannelDialog
        open={channelDialog.open}
        defaultType="text"
        categoryId={channelDialog.categoryId}
        onOpenChange={(open) => setChannelDialog((d) => ({ ...d, open }))}
      />
      {canManageChannels && (
        <>
          <CategoryNameDialog
            open={nameDialog.open}
            category={nameDialog.category}
            onOpenChange={(open) => setNameDialog((d) => ({ ...d, open }))}
          />
          <DeleteCategoryDialog category={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
        </>
      )}
      {canAdminister && <CommunitySettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />}
    </aside>
  )
}

function DropLine({ edge }: { edge: DropEdge | null }) {
  if (!edge) return null
  return <span aria-hidden className={cn('pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary', edge === 'before' ? 'top-0' : 'bottom-0')} />
}

function ChannelList({ channels, categoryId }: { channels: Channel[]; categoryId: string | null }) {
  return (
    <div className="space-y-0.5">
      {channels.map((c, i) => {
        const slot = { categoryId, nextId: channels[i + 1]?.id ?? null }
        return c.type === 'voice' ? <VoiceChannelItem key={c.id} channel={c} slot={slot} /> : <TextChannelItem key={c.id} channel={c} slot={slot} />
      })}
    </div>
  )
}

function UncategorizedChannels({ channels }: { channels: Channel[] }) {
  const { enabled, apply } = useContext(ArrangeContext)
  const drop = useDropTarget(enabled ? [CHANNEL_DRAG] : [], (_kind, id) =>
    apply((layout) => moveChannel(layout, id, { categoryId: null, beforeId: channels[0]?.id ?? null }))
  )
  if (!enabled && channels.length === 0) return null
  return (
    <section aria-label="Canais sem categoria">
      {enabled && (
        <div {...drop.props} data-testid="sem-categoria" className="relative h-2">
          <DropLine edge={drop.edge} />
        </div>
      )}
      <ChannelList channels={channels} categoryId={null} />
    </section>
  )
}

interface CategorySectionProps {
  group: CategoryGroup
  nextCategoryId: string | null
  collapsed: boolean
  onToggle: () => void
  onAddChannel: () => void
  onRename: () => void
  onDelete: () => void
}

function CategorySection({ group, nextCategoryId, collapsed, onToggle, onAddChannel, onRename, onDelete }: CategorySectionProps) {
  const { category, channels } = group
  const { enabled, apply } = useContext(ArrangeContext)
  const drop = useDropTarget(enabled ? [CATEGORY_DRAG, CHANNEL_DRAG] : [], (kind, id, edge) =>
    apply((layout) =>
      kind === CATEGORY_DRAG
        ? moveCategory(layout, id, edge === 'before' ? category.id : nextCategoryId)
        : moveChannel(layout, id, { categoryId: category.id, beforeId: channels[0]?.id ?? null })
    )
  )

  return (
    <section aria-label={category.name}>
      <Menu>
        <MenuContextTrigger
          disabled={!enabled}
          {...dragSource(CATEGORY_DRAG, category.id, enabled)}
          {...drop.props}
          className="group relative flex items-center rounded-sm pr-1 pb-1"
        >
          <DropLine edge={drop.edge} />
          <button
            onClick={onToggle}
            aria-expanded={!collapsed}
            className="flex min-w-0 flex-1 items-center gap-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-accent-foreground"
          >
            <ChevronDown className={cn('size-3 shrink-0 transition-transform', collapsed && '-rotate-90')} />
            <span className="truncate">{category.name}</span>
          </button>
          {enabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onAddChannel} aria-label="Criar canal" className="text-muted-foreground hover:text-accent-foreground">
                  <Plus className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Criar canal</TooltipContent>
            </Tooltip>
          )}
        </MenuContextTrigger>
        <MenuContent data-glass="surface" className={MENU_CONTENT}>
          <MenuItem onSelect={onAddChannel} className={MENU_ITEM}>
            <Plus aria-hidden />
            Criar canal
          </MenuItem>
          <MenuItem onSelect={onRename} className={MENU_ITEM}>
            <Pencil aria-hidden />
            Renomear categoria
          </MenuItem>
          <MenuSeparator className="my-1 h-px bg-border" />
          <MenuItem onSelect={onDelete} className={cn(MENU_ITEM, 'text-destructive data-highlighted:text-destructive')}>
            <Trash2 aria-hidden />
            Apagar categoria
          </MenuItem>
        </MenuContent>
      </Menu>
      {!collapsed && <ChannelList channels={channels} categoryId={category.id} />}
    </section>
  )
}

function useChannelRow(channel: Channel, slot: Slot) {
  const { enabled, apply } = useContext(ArrangeContext)
  const drop = useDropTarget(enabled ? [CHANNEL_DRAG] : [], (_kind, id, edge) =>
    apply((layout) => moveChannel(layout, id, { categoryId: slot.categoryId, beforeId: edge === 'before' ? channel.id : slot.nextId }))
  )
  return { rowProps: { ...dragSource(CHANNEL_DRAG, channel.id, enabled), ...drop.props }, edge: drop.edge }
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

function TextChannelItem({ channel, slot }: { channel: Channel; slot: Slot }) {
  const { rowProps, edge } = useChannelRow(channel, slot)
  const active = useApp((s) => s.view?.kind === 'text' && s.view.channelId === channel.id)
  const unread = useApp((s) => !!s.unread[channel.id])
  const muted = useChannelMuted(channel.id)

  return (
    <MuteChannelMenu channelId={channel.id} noun="canal">
      <div
        {...onActivate(() => selectTextChannel(channel.id))}
        {...rowProps}
        data-muted={muted}
        className={cn(
          itemBase,
          active && 'bg-accent text-accent-foreground hover:bg-accent',
          unread && !active && 'font-semibold text-accent-foreground',
          muted && !active && 'opacity-50'
        )}
      >
        <DropLine edge={edge} />
        {unread && !active && <span className="absolute -left-2 h-2 w-1 rounded-r-full bg-accent-foreground" />}
        <Hash className="size-5 shrink-0 opacity-60" />
        <span className="flex-1 truncate text-[15px]">{channel.name}</span>
        <PrivateBadge channelId={channel.id} />
        <ChannelActions channel={channel} />
      </div>
    </MuteChannelMenu>
  )
}

/** Arrastar uma pessoa da lista de uma sala de voz para outra (mover, como no Discord). */
const VOICE_USER_DRAG = 'application/x-concord-voice-user'
const isVoiceUserDrag = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes(VOICE_USER_DRAG)

function VoiceChannelItem({ channel, slot }: { channel: Channel; slot: Slot }) {
  const { rowProps, edge } = useChannelRow(channel, slot)
  const active = useApp((s) => s.view?.kind === 'voice' && s.view.channelId === channel.id)
  const connected = useApp((s) => s.myVoiceChannelId === channel.id)
  const joining = useApp((s) => s.joiningVoice && s.view?.channelId === channel.id)
  const members = useApp(useShallow((s) => s.voice.filter((v) => v.channelId === channel.id)))
  // soltando alguém aqui (moderador arrastando da lista de outra sala)
  const [dropping, setDropping] = useState(false)
  // chat de texto da sala: mensagem nova sem o painel "Chat" aberto
  const unread = useApp((s) => !!s.unread[channel.id])
  const muted = useChannelMuted(channel.id)

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
      <MuteChannelMenu channelId={channel.id} noun="canal">
        <div
          {...onActivate(() => void joinVoice(channel.id))}
          {...rowProps}
          data-muted={muted}
          className={cn(
            itemBase,
            active && 'bg-accent text-accent-foreground hover:bg-accent',
            connected && 'text-accent-foreground',
            unread && 'font-semibold text-accent-foreground',
            muted && !active && !connected && 'opacity-50'
          )}
        >
          <DropLine edge={edge} />
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
      </MuteChannelMenu>
      {members.length > 0 && (
        <div className="space-y-0.5 py-1 pl-6">
          {members.map((m) => (
            <VoiceMember key={m.userId} state={m} />
          ))}
          <MusicBotMember channelId={channel.id} />
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
  // quem pode mover a pessoa (canMoveMember) pode arrastá-la para outra sala (o servidor confere de novo)
  const canMove = useApp((s) => !!user && !!s.access && !!s.self && canMoveMember(s.access, s.self.accountId, user.accountId))
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
        {state.sharing && <LivePreview userId={state.userId} />}
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
