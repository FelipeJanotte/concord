import { Label } from '@/components/ui/label'
import { setChannelNotifications, setNotificationSound, setNotificationsEnabled } from '@/lib/client'
import { useApp, type ChannelNotifyMode } from '@/store'
import type { NotificationSoundKind } from '@/store/notifications'
import { SettingsHeading } from './SettingsHeading'

const OPTIONS: { value: ChannelNotifyMode; label: string }[] = [
  { value: 'all', label: 'Todas as mensagens' },
  { value: 'mentions', label: 'Só quando me mencionarem (@você ou @todos)' },
  { value: 'none', label: 'Nenhuma' }
]

const SOUND_OPTIONS: { kind: NotificationSoundKind; label: string }[] = [
  { kind: 'dm', label: 'Mensagem em conversa privada' },
  { kind: 'mention', label: 'Menção (@você ou @todos)' },
  { kind: 'friend', label: 'Pedido de amizade' }
]

const SECTION_LABEL = 'text-xs font-bold tracking-wide text-muted-foreground uppercase'

export function ChannelNotificationSetting() {
  const mode = useApp((s) => s.channelNotifications)
  const enabled = useApp((s) => s.notificationsEnabled)
  return (
    <div className="space-y-1.5">
      <Label htmlFor="channel-notifications" className={SECTION_LABEL}>
        Notificar mensagens de canal
      </Label>
      <select
        id="channel-notifications"
        value={mode}
        disabled={!enabled}
        onChange={(e) => setChannelNotifications(e.target.value as ChannelNotifyMode)}
        className="h-9 w-full rounded-md border border-border bg-input px-2 text-sm text-foreground disabled:opacity-60"
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

function NotificationsToggle() {
  const enabled = useApp((s) => s.notificationsEnabled)
  return (
    <div className="space-y-1.5">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} onChange={(e) => setNotificationsEnabled(e.target.checked)} className="size-4 accent-primary" />
        Mostrar notificações do Concord
      </label>
      <p className="pl-6 text-xs text-muted-foreground">
        Desligado: nenhum aviso do Windows/macOS e nenhum número no ícone do app. Vale neste computador.
      </p>
    </div>
  )
}

function NotificationSoundSettings() {
  const sounds = useApp((s) => s.notificationSounds)
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className={SECTION_LABEL}>Tocar um som</p>
      {SOUND_OPTIONS.map((o) => (
        <label key={o.kind} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={sounds[o.kind]} onChange={(e) => setNotificationSound(o.kind, e.target.checked)} className="size-4 accent-primary" />
          {o.label}
        </label>
      ))}
      <p className="text-xs text-muted-foreground">
        Toca também com o Concord aberto, menos na conversa que você está vendo. Fica mudo com o áudio desligado e em
        canais e conversas silenciados. Vale neste computador.
      </p>
    </div>
  )
}

export function NotificationSettings() {
  return (
    <div className="space-y-5">
      <SettingsHeading title="Notificações" description="Avisos do Windows/macOS quando o Concord está em segundo plano." />
      <NotificationsToggle />
      <ChannelNotificationSetting />
      <NotificationSoundSettings />
    </div>
  )
}
