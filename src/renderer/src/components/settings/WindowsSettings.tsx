import { setOpenAtLogin } from '@/lib/client'
import { useApp } from '@/store'
import { SettingsHeading } from './SettingsHeading'

export function WindowsSettings() {
  const openAtLogin = useApp((s) => s.openAtLogin.supported && s.openAtLogin.enabled)
  return (
    <div className="space-y-5">
      <SettingsHeading title="Windows" description="Como o Concord se comporta no seu computador." />
      <div className="space-y-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={openAtLogin} onChange={(e) => void setOpenAtLogin(e.target.checked)} className="size-4 accent-primary" />
          Iniciar o Concord com o Windows
        </label>
        <p className="pl-6 text-xs text-muted-foreground">O Concord abre sozinho quando você entra no Windows. Vale neste computador.</p>
      </div>
    </div>
  )
}
