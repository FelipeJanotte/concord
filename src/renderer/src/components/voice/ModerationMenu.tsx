/**
 * Moderação da voz (B6) no menu de botão direito sobre uma pessoa: "Mover para" (outra sala de voz),
 * "Silenciar para todos" e "Expulsar da voz". Só aparece para quem pode moderar a pessoa (`canModerate`: gerenciar membros
 * e cargo acima do dela) e enquanto ela está numa sala de voz que eu vejo.
 */
import { ArrowRightLeft, MicOff, PhoneOff, ShieldAlert, Volume2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { canModerate } from '@shared/types'
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import { kickFromVoice, moveToVoice, notify, setServerMuted } from '@/lib/client'
import { allows } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

/** Conexões da conta que estão em alguma sala de voz (a mesma pessoa pode estar em dois lugares). */
function useVoiceConnections(accountId: string) {
  return useApp(
    useShallow((s) => s.voice.filter((v) => s.users.find((u) => u.id === v.userId)?.accountId === accountId))
  )
}

function report(err: unknown, fallback: string): void {
  notify(err instanceof Error ? err.message : fallback)
}

export function ModerationItems({ accountId, name }: { accountId: string; name: string }) {
  const allowed = useApp((s) => !!s.access && !!s.self && canModerate(s.access, s.self.accountId, accountId))
  const connections = useVoiceConnections(accountId)
  if (!allowed || connections.length === 0) return null
  const serverMuted = connections.some((v) => v.serverMuted)

  return (
    <>
      <ContextMenuSeparator />
      <MoveToItems accountId={accountId} connections={connections} />
      <ContextMenuCheckboxItem
        checked={serverMuted}
        onCheckedChange={(checked) =>
          setServerMuted(accountId, checked === true).catch((err: unknown) => report(err, 'Não foi possível silenciar'))
        }
        onSelect={(e) => e.preventDefault()}
      >
        <MicOff className={cn(serverMuted && 'text-destructive')} />
        Silenciar para todos
      </ContextMenuCheckboxItem>
      <ContextMenuItem
        variant="destructive"
        onSelect={() => {
          if (!window.confirm(`Tirar ${name} da sala de voz?`)) return
          for (const v of connections) {
            kickFromVoice(v.userId).catch((err: unknown) => report(err, 'Não foi possível expulsar'))
          }
        }}
      >
        <PhoneOff />
        Expulsar da voz
      </ContextMenuItem>
    </>
  )
}

/**
 * "Mover para ▸": as salas de voz que eu vejo, menos aquela em que a pessoa já está e as que ela não
 * pode ver/entrar (o servidor confere de novo). Chamada privada não aparece (não é sala da comunidade).
 */
function MoveToItems({ accountId, connections }: { accountId: string; connections: { userId: string; channelId: string }[] }) {
  const rooms = useApp(
    useShallow((s) =>
      s.channels.filter(
        (c) =>
          c.type === 'voice' &&
          connections.some((v) => v.channelId !== c.id) &&
          allows(s.access, accountId, 'view', c.id) &&
          allows(s.access, accountId, 'connect', c.id)
      )
    )
  )
  // só move de sala da comunidade (quem está numa chamada privada não aparece aqui)
  const fromRooms = useApp(useShallow((s) => connections.filter((v) => s.channels.some((c) => c.id === v.channelId))))
  if (rooms.length === 0 || fromRooms.length === 0) return null
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <ArrowRightLeft />
        Mover para
      </ContextMenuSubTrigger>
      <ContextMenuSubContent aria-label="Mover para">
        {rooms.map((room) => (
          <ContextMenuItem
            key={room.id}
            onSelect={() => {
              for (const v of fromRooms) {
                if (v.channelId === room.id) continue
                moveToVoice(v.userId, room.id).catch((err: unknown) => report(err, 'Não foi possível mover'))
              }
            }}
          >
            <Volume2 />
            {room.name}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}

/** Ícone de quem foi silenciado por um moderador (no lugar do microfone cortado comum). */
export function ServerMutedIcon({ className }: { className?: string }) {
  return (
    <span title="Silenciado por um moderador" className="inline-flex">
      <ShieldAlert className={cn('size-3.5 shrink-0 text-destructive', className)} aria-label="Silenciado por um moderador" />
    </span>
  )
}
