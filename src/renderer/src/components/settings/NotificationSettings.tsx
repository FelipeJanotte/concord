// Notificações (B9): o que avisar das mensagens de canal. Fica em "Minha conta"; vale nesta máquina.
import { Label } from '@/components/ui/label'
import { setChannelNotifications } from '@/lib/client'
import { useApp, type ChannelNotifyMode } from '@/store'

const OPTIONS: { value: ChannelNotifyMode; label: string }[] = [
  { value: 'all', label: 'Todas as mensagens' },
  { value: 'mentions', label: 'Só quando me mencionarem (@você ou @todos)' },
  { value: 'none', label: 'Nenhuma' }
]

export function ChannelNotificationSetting() {
  const mode = useApp((s) => s.channelNotifications)
  return (
    <div className="space-y-1.5">
      <Label htmlFor="channel-notifications" className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
        Notificar mensagens de canal
      </Label>
      <select
        id="channel-notifications"
        value={mode}
        onChange={(e) => setChannelNotifications(e.target.value as ChannelNotifyMode)}
        className="h-9 w-full rounded-md border border-border bg-input px-2 text-sm text-foreground"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Só com o Concord em segundo plano. Conversas privadas e chamadas sempre avisam. Vale neste computador.
      </p>
    </div>
  )
}
