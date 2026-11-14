// "Configurações de voz": microfone e saída de áudio (B4). O volume de cada pessoa fica no botão direito sobre ela.
import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  canChooseAudioOutput,
  closeDeviceSettings,
  listAudioDevices,
  selectAudioInput,
  selectAudioOutput,
  type AudioDevice
} from '@/lib/client'
import { useApp } from '@/store'

const DEFAULT = '__default__'

export function DeviceSettings() {
  const open = useApp((s) => s.deviceSettingsOpen)
  const inputId = useApp((s) => s.audioInputId)
  const outputId = useApp((s) => s.audioOutputId)
  const [devices, setDevices] = useState<{ inputs: AudioDevice[]; outputs: AudioDevice[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const outputSupported = canChooseAudioOutput()

  const refresh = useCallback(async () => {
    try {
      setDevices(await listAudioDevices())
      setError(null)
    } catch {
      setError('Não foi possível listar os dispositivos de áudio.')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void refresh()
    // Fone conectado/desconectado com o diálogo aberto: atualiza a lista.
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    media?.addEventListener?.('devicechange', refresh)
    return () => media?.removeEventListener?.('devicechange', refresh)
  }, [open, refresh])

  const namesHidden = !!devices && [...devices.inputs, ...devices.outputs].every((d) => /^(Microfone|Saída) \d+$/.test(d.label))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDeviceSettings()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurações de voz</DialogTitle>
          <DialogDescription>Valem neste computador. A troca vale na hora, mesmo com você numa sala.</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-4">
          <DeviceSelect
            id="audio-input"
            label="Microfone"
            value={inputId}
            devices={devices?.inputs}
            onChange={(id) => void selectAudioInput(id)}
          />
          {outputSupported && (
            <DeviceSelect
              id="audio-output"
              label="Saída de áudio"
              value={outputId}
              devices={devices?.outputs}
              onChange={(id) => void selectAudioOutput(id)}
            />
          )}
          {namesHidden && (
            <p className="text-xs text-muted-foreground">
              Os nomes dos dispositivos aparecem depois que o Concord puder usar o microfone (entre numa sala de voz uma vez).
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Para ajustar o volume ou silenciar alguém, clique com o botão direito na pessoa.
        </p>
      </DialogContent>
    </Dialog>
  )
}

function DeviceSelect({
  id,
  label,
  value,
  devices,
  onChange
}: {
  id: string
  label: string
  value: string | null
  devices: AudioDevice[] | undefined
  onChange: (deviceId: string | null) => void
}) {
  // Escolhido mas desconectado agora: continua aparecendo para a pessoa entender o que está salvo.
  const missing = value && devices && !devices.some((d) => d.deviceId === value)
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value ?? DEFAULT}
        disabled={!devices}
        onChange={(e) => onChange(e.target.value === DEFAULT ? null : e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-input px-2 text-sm text-foreground disabled:opacity-60"
      >
        <option value={DEFAULT}>Padrão do sistema</option>
        {devices?.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
        {missing && <option value={value}>Dispositivo desconectado</option>}
      </select>
    </div>
  )
}
