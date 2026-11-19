import { ArrowRightLeft, Ban, Clock, DoorOpen, MicOff, PhoneOff, ShieldAlert, Volume2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { canBanMember, canKickMember, canModerate, canMoveMember, canTimeoutMember, type VoiceState } from '@shared/types'
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import { kickFromCommunity, kickFromVoice, moveToVoice, notify, setServerMuted, timeoutMember } from '@/lib/client'
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

type TargetRule = typeof canModerate

function useAllowedOn(rule: TargetRule, accountId: string): boolean {
  return useApp((s) => !!s.access && !!s.self && rule(s.access, s.self.accountId, accountId))
}

export function ModerationItems({ accountId, name, onBan }: { accountId: string; name: string; onBan: () => void }) {
  return (
    <>
      <VoiceModerationItems accountId={accountId} name={name} />
      <CommunityModerationItems accountId={accountId} name={name} onBan={onBan} />
    </>
  )
}

function VoiceModerationItems({ accountId, name }: { accountId: string; name: string }) {
  const moderates = useAllowedOn(canModerate, accountId)
  const moves = useAllowedOn(canMoveMember, accountId)
  const connections = useVoiceConnections(accountId)
  if (!(moderates || moves) || connections.length === 0) return null

  return (
    <>
      <ContextMenuSeparator />
      {moves && <MoveToItems accountId={accountId} connections={connections} />}
      {moderates && <MuteAndKickItems accountId={accountId} name={name} connections={connections} />}
    </>
  )
}

const TIMEOUT_CHOICES = [
  { label: '1 minuto', minutes: 1 },
  { label: '10 minutos', minutes: 10 },
  { label: '1 hora', minutes: 60 },
  { label: '1 dia', minutes: 24 * 60 },
  { label: '1 semana', minutes: 7 * 24 * 60 }
]

function CommunityModerationItems({ accountId, name, onBan }: { accountId: string; name: string; onBan: () => void }) {
  const kicks = useAllowedOn(canKickMember, accountId)
  const bans = useAllowedOn(canBanMember, accountId)
  const timesOut = useAllowedOn(canTimeoutMember, accountId)
  const timedOut = useApp((s) => accountId in s.timeouts)
  if (!(kicks || bans || timesOut)) return null

  const timeout = (minutes: number): void => {
    timeoutMember(accountId, minutes).catch((err: unknown) => report(err, 'Não foi possível mudar o castigo'))
  }

  return (
    <>
      <ContextMenuSeparator />
      {timesOut && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Clock className={cn(timedOut && 'text-destructive')} />
            Castigo
          </ContextMenuSubTrigger>
          <ContextMenuSubContent aria-label="Castigo">
            {timedOut ? (
              <ContextMenuItem onSelect={() => timeout(0)}>Tirar castigo</ContextMenuItem>
            ) : (
              TIMEOUT_CHOICES.map((choice) => (
                <ContextMenuItem key={choice.minutes} onSelect={() => timeout(choice.minutes)}>
                  {choice.label}
                </ContextMenuItem>
              ))
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      {kicks && (
        <ContextMenuItem
          variant="destructive"
          onSelect={() => {
            if (!window.confirm(`Expulsar ${name} da comunidade? Ela pode voltar entrando de novo.`)) return
            kickFromCommunity(accountId).catch((err: unknown) => report(err, 'Não foi possível expulsar'))
          }}
        >
          <DoorOpen />
          Expulsar da comunidade
        </ContextMenuItem>
      )}
      {bans && (
        <ContextMenuItem variant="destructive" onSelect={onBan}>
          <Ban />
          Banir da comunidade
        </ContextMenuItem>
      )}
    </>
  )
}

function MuteAndKickItems({ accountId, name, connections }: { accountId: string; name: string; connections: VoiceState[] }) {
  const serverMuted = connections.some((v) => v.serverMuted)
  return (
    <>
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
