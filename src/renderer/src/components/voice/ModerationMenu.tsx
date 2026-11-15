/**
 * Moderação da voz (B6) no menu de botão direito sobre uma pessoa: "Silenciar para todos" e
 * "Expulsar da voz". Só aparece para quem pode moderar a pessoa (`canModerate`: gerenciar membros
 * e cargo acima do dela) e enquanto ela está numa sala de voz que eu vejo.
 */
import { MicOff, PhoneOff, ShieldAlert } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { canModerate } from '@shared/types'
import { ContextMenuCheckboxItem, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { kickFromVoice, notify, setServerMuted } from '@/lib/client'
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

/** Ícone de quem foi silenciado por um moderador (no lugar do microfone cortado comum). */
export function ServerMutedIcon({ className }: { className?: string }) {
  return (
    <span title="Silenciado por um moderador" className="inline-flex">
      <ShieldAlert className={cn('size-3.5 shrink-0 text-destructive', className)} aria-label="Silenciado por um moderador" />
    </span>
  )
}
