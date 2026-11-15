// "Configurações de voz": microfone, saída de áudio (B4), supressão de ruído automática (B13), pressione para falar (B20), sons de entrar/sair da sala (B16) e sobreposição em jogos (B15). O volume de cada pessoa fica no botão direito sobre ela.
import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  canChooseAudioOutput,
  closeDeviceSettings,
  listAudioDevices,
  previewVoiceSound,
  selectAudioInput,
  selectAudioOutput,
  setNoiseSuppression,
  setOverlayCorner,
  setOverlayEnabled,
  setOverlaySize,
  setVoiceSounds,
  type AudioDevice
} from '@/lib/client'
import { OVERLAY_SHORTCUT_LABEL, type OverlayCorner, type OverlaySize } from '@shared/overlay'
import { useApp } from '@/store'
import { PushToTalkSettings } from './PushToTalk'

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

        <NoiseSuppression />

        <PushToTalkSettings />

        <JoinLeaveSounds />

        <GameOverlay />

        <p className="text-xs text-muted-foreground">
          Para ajustar o volume ou silenciar alguém, clique com o botão direito na pessoa.
        </p>
      </DialogContent>
    </Dialog>
  )
}

const NOISE_TEXT = {
  off: 'Desligada: o microfone vai sem filtro.',
  light: 'Ambiente silencioso: usando o filtro leve.',
  advanced: 'Ruído detectado: filtro avançado ativo.',
  'light-fallback': 'Filtro avançado indisponível neste computador: usando o filtro leve.'
} as const

/** Supressão de ruído automática (B13): só liga/desliga; o modo o app escolhe sozinho. */
function NoiseSuppression() {
  const enabled = useApp((s) => s.noiseSuppression)
  const mode = useApp((s) => s.noiseMode)
  const status = !enabled ? NOISE_TEXT.off : mode && mode !== 'off' ? NOISE_TEXT[mode] : 'Começa a funcionar quando você entrar numa sala de voz.'
  return (
    <div className="space-y-1 border-t border-border pt-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => void setNoiseSuppression(e.target.checked)}
          className="size-4 accent-primary"
        />
        Supressão de ruído automática
      </label>
      <p className="pl-6 text-xs text-muted-foreground" aria-live="polite">
        {status}
      </p>
    </div>
  )
}

/** Sons de quando alguém entra ou sai da sala (B16). */
function JoinLeaveSounds() {
  const enabled = useApp((s) => s.voiceSoundsEnabled)
  const pct = useApp((s) => Math.round(s.voiceSoundsVolume * 100))
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setVoiceSounds({ enabled: e.target.checked })}
          className="size-4 accent-primary"
        />
        Tocar um som quando alguém entra ou sai da sala
      </label>
      <div className="flex items-center gap-3 pl-6">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          disabled={!enabled}
          aria-label="Volume dos sons de entrada e saída"
          onChange={(e) => setVoiceSounds({ volume: Number(e.target.value) / 100 })}
          className="flex-1 accent-primary disabled:opacity-50"
        />
        <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct}%</span>
        <Button variant="secondary" size="sm" onClick={previewVoiceSound}>
          Testar
        </Button>
      </div>
    </div>
  )
}

const CORNERS: Record<OverlayCorner, string> = {
  'top-left': 'Canto superior esquerdo',
  'top-right': 'Canto superior direito',
  'bottom-left': 'Canto inferior esquerdo',
  'bottom-right': 'Canto inferior direito'
}
const SIZES: Record<OverlaySize, string> = { small: 'Pequeno', medium: 'Médio', large: 'Grande' }

/** Sobreposição em jogos (B15): quem está na sala e quem fala, por cima do jogo. */
function GameOverlay() {
  const enabled = useApp((s) => s.overlayEnabled)
  const corner = useApp((s) => s.overlayCorner)
  const size = useApp((s) => s.overlaySize)
  const selectClass = 'h-9 rounded-md border border-border bg-input px-2 text-sm text-foreground disabled:opacity-60'
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} onChange={(e) => setOverlayEnabled(e.target.checked)} className="size-4 accent-primary" />
        Mostrar quem está falando por cima dos jogos
      </label>
      <div className="flex flex-wrap gap-2 pl-6">
        <select aria-label="Posição do overlay" value={corner} disabled={!enabled} onChange={(e) => setOverlayCorner(e.target.value as OverlayCorner)} className={selectClass}>
          {(Object.keys(CORNERS) as OverlayCorner[]).map((c) => (
            <option key={c} value={c}>
              {CORNERS[c]}
            </option>
          ))}
        </select>
        <select aria-label="Tamanho do overlay" value={size} disabled={!enabled} onChange={(e) => setOverlaySize(e.target.value as OverlaySize)} className={selectClass}>
          {(Object.keys(SIZES) as OverlaySize[]).map((z) => (
            <option key={z} value={z}>
              {SIZES[z]}
            </option>
          ))}
        </select>
      </div>
      <p className="pl-6 text-xs text-muted-foreground">
        Aparece quando você está numa sala de voz. Liga e desliga também pelo atalho <kbd className="rounded bg-accent px-1">{OVERLAY_SHORTCUT_LABEL}</kbd>, mesmo dentro do jogo. Funciona com o jogo em janela ou em
        tela cheia sem bordas; em tela cheia exclusiva o Windows não deixa nada aparecer por cima.
      </p>
    </div>
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
