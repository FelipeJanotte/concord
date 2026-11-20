import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  cancelOverlayShortcutRecording,
  canChooseAudioOutput,
  listAudioDevices,
  previewVoiceSound,
  recordOverlayShortcutKey,
  resetOverlayShortcuts,
  selectAudioInput,
  selectAudioOutput,
  selectCamera,
  setMicGain,
  setOutputVolume,
  setNoiseSuppression,
  setOverlayCorner,
  finishOverlayEditing,
  startOverlayEditing,
  setOverlayEnabled,
  setOverlaySize,
  setVoiceLeveler,
  setVoiceLevelerTarget,
  setVoiceSounds,
  startOverlayShortcutRecording,
  type AudioDevice
} from '@/lib/client'
import type { LevelerTarget } from '@/lib/leveler/level'
import { shortcutLabel, type OverlayCorner, type OverlayShortcutAction, type OverlaySize } from '@shared/overlay'
import { MIC_GAIN_MAX, OUTPUT_VOLUME_MAX } from '@/lib/mic-gain'
import { useApp } from '@/store'
import { PushToTalkSettings } from '../voice/PushToTalk'
import { SettingsHeading } from './SettingsHeading'

const DEFAULT = '__default__'

export function VoiceSettings() {
  const inputId = useApp((s) => s.audioInputId)
  const outputId = useApp((s) => s.audioOutputId)
  const cameraId = useApp((s) => s.cameraId)
  const [devices, setDevices] = useState<{ inputs: AudioDevice[]; outputs: AudioDevice[]; cameras: AudioDevice[] } | null>(null)
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
    void refresh()
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    media?.addEventListener?.('devicechange', refresh)
    return () => media?.removeEventListener?.('devicechange', refresh)
  }, [refresh])

  const namesHidden = !!devices && [...devices.inputs, ...devices.outputs].every((d) => /^(Microfone|Saída) \d+$/.test(d.label))

  return (
    <div className="space-y-4">
      <SettingsHeading title="Voz e vídeo" description="Valem neste computador. A troca vale na hora, mesmo com você numa sala." />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-4">
        <DeviceSelect id="audio-input" label="Microfone" value={inputId} devices={devices?.inputs} onChange={(id) => void selectAudioInput(id)} />
        {outputSupported && (
          <DeviceSelect
            id="audio-output"
            label="Saída de áudio"
            value={outputId}
            devices={devices?.outputs}
            onChange={(id) => void selectAudioOutput(id)}
          />
        )}
        <DeviceSelect id="camera" label="Câmera" value={cameraId} devices={devices?.cameras} onChange={(id) => void selectCamera(id)} />
        {namesHidden && (
          <p className="text-xs text-muted-foreground">
            Os nomes dos dispositivos aparecem depois que o Concord puder usar o microfone (entre numa sala de voz uma vez).
          </p>
        )}
      </div>

      <VolumeSettings />

      <VoiceLevelerSettings />

      <NoiseSuppression />

      <PushToTalkSettings />

      <JoinLeaveSounds />

      <GameOverlay />

      <p className="text-xs text-muted-foreground">Para ajustar o volume ou silenciar alguém, clique com o botão direito na pessoa.</p>
    </div>
  )
}

function VolumeSettings() {
  const mic = useApp((s) => Math.round(s.micGain * 100))
  const output = useApp((s) => Math.round(s.outputVolume * 100))
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <VolumeSlider
        id="mic-volume"
        label="Volume do microfone"
        value={mic}
        max={MIC_GAIN_MAX * 100}
        onChange={(v) => void setMicGain(v / 100)}
      />
      <VolumeSlider
        id="output-volume"
        label="Volume de saída"
        value={output}
        max={OUTPUT_VOLUME_MAX * 100}
        onChange={(v) => setOutputVolume(v / 100)}
      />
      <p className="text-xs text-muted-foreground">
        O volume de saída vale para a voz de todos, o áudio das telas, os efeitos sonoros e os sons da sala.
      </p>
    </div>
  )
}

function VolumeSlider({ id, label, value, max, onChange }: { id: string; label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground disabled:invisible"
          disabled={value === 100}
          onClick={() => onChange(100)}
        >
          Voltar para 100%
        </button>
      </div>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{value}%</span>
      </div>
    </div>
  )
}

const LEVELER_TARGET_LABELS: Record<LevelerTarget, string> = { low: 'Baixo', medium: 'Médio', high: 'Alto' }

function VoiceLevelerSettings() {
  const enabled = useApp((s) => s.voiceLeveler)
  const target = useApp((s) => s.voiceLevelerTarget)
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} onChange={(e) => setVoiceLeveler(e.target.checked)} className="size-4 accent-primary" />
        Equalizador automático
      </label>
      <div className="flex items-center gap-2 pl-6">
        <select
          aria-label="Volume-alvo do equalizador"
          value={target}
          disabled={!enabled}
          onChange={(e) => setVoiceLevelerTarget(e.target.value as LevelerTarget)}
          className="h-9 rounded-md border border-border bg-input px-2 text-sm text-foreground disabled:opacity-60"
        >
          {(Object.keys(LEVELER_TARGET_LABELS) as LevelerTarget[]).map((t) => (
            <option key={t} value={t}>
              {LEVELER_TARGET_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <p className="pl-6 text-xs text-muted-foreground">
        Mede a voz de cada pessoa da sala e aumenta quem está baixo ou abaixa quem está alto, para todos ficarem no mesmo volume.
        Só muda o que você ouve. Quanto o equalizador está mexendo em cada um aparece no botão direito sobre a pessoa.
      </p>
    </div>
  )
}

const NOISE_TEXT = {
  off: 'Desligada: o microfone vai sem filtro.',
  light: 'Ambiente silencioso: usando o filtro leve.',
  advanced: 'Ruído detectado: filtro avançado ativo.',
  'light-fallback': 'Filtro avançado indisponível neste computador: usando o filtro leve.'
} as const

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

const CUSTOM = '__custom__'
const CORNERS: Record<OverlayCorner, string> = {
  'top-left': 'Canto superior esquerdo',
  'top-right': 'Canto superior direito',
  'bottom-left': 'Canto inferior esquerdo',
  'bottom-right': 'Canto inferior direito'
}
const SIZES: Record<OverlaySize, string> = { small: 'Pequeno', medium: 'Médio', large: 'Grande' }

function GameOverlay() {
  const enabled = useApp((s) => s.overlayEnabled)
  const corner = useApp((s) => s.overlayCorner)
  const size = useApp((s) => s.overlaySize)
  const moved = useApp((s) => s.overlayPosition !== null)
  const editing = useApp((s) => s.overlayEditing)
  const editLabel = useApp((s) => shortcutLabel(s.overlayShortcuts.edit))
  const canMove = typeof window !== 'undefined' && !!window.api?.overlay
  const selectClass = 'h-9 rounded-md border border-border bg-input px-2 text-sm text-foreground disabled:opacity-60'
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} onChange={(e) => setOverlayEnabled(e.target.checked)} className="size-4 accent-primary" />
        Mostrar quem está falando por cima dos jogos
      </label>
      <div className="flex flex-wrap gap-2 pl-6">
        <select
          aria-label="Posição do overlay"
          value={moved ? CUSTOM : corner}
          disabled={!enabled}
          onChange={(e) => e.target.value !== CUSTOM && setOverlayCorner(e.target.value as OverlayCorner)}
          className={selectClass}
        >
          {moved && <option value={CUSTOM}>Onde você arrastou</option>}
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
        {canMove && (
          <Button variant={editing ? 'default' : 'secondary'} size="sm" className="h-9" disabled={!enabled} onClick={() => (editing ? finishOverlayEditing() : startOverlayEditing())}>
            {editing ? 'Concluir' : 'Mover'}
          </Button>
        )}
      </div>
      {editing && (
        <p className="pl-6 text-xs text-foreground" aria-live="polite">
          Arraste a sobreposição para onde quiser na tela. Arraste a alça da lateral para mudar a largura. Termine com “Concluir”, Esc ou <kbd className="rounded bg-accent px-1">{editLabel}</kbd>.
        </p>
      )}
      <p className="pl-6 text-xs text-muted-foreground">
        Mostra só quem está falando na sua sala de voz e some enquanto o Concord está em foco. Os atalhos funcionam mesmo dentro do jogo. Funciona com o
        jogo em janela ou em tela cheia sem bordas; em tela cheia exclusiva o Windows não deixa nada aparecer por cima.
      </p>
      {canMove && <OverlayShortcutSettings />}
    </div>
  )
}

const SHORTCUT_NAMES: Record<OverlayShortcutAction, string> = { toggle: 'para ligar e desligar', edit: 'do modo de mover' }
const SHORTCUT_TITLES: Record<OverlayShortcutAction, string> = { toggle: 'Ligar e desligar', edit: 'Modo de mover' }

function OverlayShortcutSettings() {
  const shortcuts = useApp((s) => s.overlayShortcuts)
  const taken = useApp((s) => s.overlayShortcutTaken)
  const recording = useApp((s) => s.overlayRecording)

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      recordOverlayShortcutKey(e)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', cancelOverlayShortcutRecording)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', cancelOverlayShortcutRecording)
    }
  }, [recording])

  useEffect(() => cancelOverlayShortcutRecording, [])

  return (
    <div className="space-y-2 pl-6">
      {(['toggle', 'edit'] as const).map((action) => (
        <div key={action} className="flex flex-wrap items-center gap-2">
          <span className="w-32 text-sm text-muted-foreground">{SHORTCUT_TITLES[action]}:</span>
          <kbd aria-label={`Atalho ${SHORTCUT_NAMES[action]}`} className="rounded bg-accent px-2 py-0.5 text-sm text-accent-foreground">
            {shortcutLabel(shortcuts[action])}
          </kbd>
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Trocar atalho ${SHORTCUT_NAMES[action]}`}
            disabled={recording !== null}
            onClick={() => startOverlayShortcutRecording(action)}
          >
            {recording === action ? 'Pressione a combinação...' : 'Trocar'}
          </Button>
          {taken.includes(action) && (
            <span className="text-xs text-destructive">{shortcutLabel(shortcuts[action])} já é usado por outro programa: escolha outro.</span>
          )}
        </div>
      ))}
      {recording && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Pressione a nova combinação, com Ctrl, Alt ou Shift (as teclas F1 a F24 valem sozinhas). Esc desiste.
        </p>
      )}
      <Button variant="ghost" size="sm" disabled={recording !== null} onClick={resetOverlayShortcuts}>
        Restaurar padrão
      </Button>
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
