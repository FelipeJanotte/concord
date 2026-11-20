import type { ComponentType, ReactNode } from 'react'
import { Bell, Mic, Monitor, Palette, UserRound } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { closeSettings, openSettings } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp, type SettingsSection } from '@/store'
import { AccountSettings } from './AccountSettings'
import { AppearanceSettings } from './appearance/AppearanceSettings'
import { NotificationSettings } from './NotificationSettings'
import { VoiceSettings } from './VoiceSettings'
import { WindowsSettings } from './WindowsSettings'

const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode; Body: ComponentType }[] = [
  { id: 'account', label: 'Minha conta', icon: <UserRound />, Body: AccountSettings },
  { id: 'voice', label: 'Voz e vídeo', icon: <Mic />, Body: VoiceSettings },
  { id: 'appearance', label: 'Aparência', icon: <Palette />, Body: AppearanceSettings },
  { id: 'notifications', label: 'Notificações', icon: <Bell />, Body: NotificationSettings },
  { id: 'windows', label: 'Windows', icon: <Monitor />, Body: WindowsSettings }
]

export function UserSettingsDialog() {
  const section = useApp((s) => s.settingsSection)
  const choosingTag = useApp((s) => s.account?.tagLocked === false)
  const startupAvailable = useApp((s) => s.openAtLogin.supported)
  const sections = SECTIONS.filter((s) => s.id !== 'windows' || startupAvailable)
  const current = sections.find((s) => s.id === (choosingTag ? 'account' : section)) ?? sections[0]
  const Body = current.Body

  return (
    <Dialog open={section !== null} onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent className="flex h-[85vh] max-h-[720px] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogTitle className="sr-only">Configurações</DialogTitle>
        <DialogDescription className="sr-only">Minha conta, voz e vídeo, aparência e notificações.</DialogDescription>
        {!choosingTag && (
          <nav aria-label="Seções das configurações" className="flex w-52 shrink-0 flex-col gap-0.5 bg-sidebar p-3">
            <p className="px-2 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">Configurações</p>
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openSettings(s.id)}
                aria-current={s.id === current.id ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-foreground hover:bg-accent/50 hover:text-foreground [&_svg]:size-4',
                  s.id === current.id && 'bg-accent text-accent-foreground hover:bg-accent'
                )}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>
        )}
        <div data-testid="settings-body" className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
          <Body key={current.id} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
