import type { ReactNode } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { setChannelMuted } from '@/lib/client'
import { useApp } from '@/store'

export const useChannelMuted = (channelId: string): boolean => useApp((s) => s.mutedChannels.includes(channelId))

export function MuteChannelMenu({ channelId, noun, children }: { channelId: string; noun: 'canal' | 'conversa'; children: ReactNode }) {
  const muted = useChannelMuted(channelId)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => void setChannelMuted(channelId, !muted)}>
          {muted ? <Bell /> : <BellOff />}
          {muted ? `Reativar ${noun}` : `Silenciar ${noun}`}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
