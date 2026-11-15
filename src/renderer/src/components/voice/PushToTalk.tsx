// Pressione para falar (B20): a seção nas Configurações de voz e o indicador na sala.
import { Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { choosePttKey, setPttSounds, setPushToTalk } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

/** Seção "Pressione para falar" das Configurações de voz. */
export function PushToTalkSettings() {
  const enabled = useApp((s) => s.pushToTalk)
  const binding = useApp((s) => s.pttBinding)
  const sounds = useApp((s) => s.pttSounds)
  const capturing = useApp((s) => s.pttCapturing)
  const available = useApp((s) => s.pttAvailable)
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!available}
          onChange={(e) => setPushToTalk(e.target.checked)}
          className="size-4 accent-primary disabled:opacity-50"
        />
        Pressione para falar
      </label>
      {available ? (
        <>
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <span className="text-sm text-muted-foreground">Tecla:</span>
            <kbd className="rounded bg-accent px-2 py-0.5 text-sm text-accent-foreground">{binding.label}</kbd>
            <Button variant="secondary" size="sm" disabled={capturing} onClick={() => void choosePttKey()}>
              {capturing ? 'Pressione uma tecla...' : 'Trocar tecla'}
            </Button>
          </div>
          {capturing && (
            <p className="pl-6 text-xs text-muted-foreground" aria-live="polite">
              Pressione a tecla ou o botão do meio/lateral do mouse que vai abrir o microfone. Esc desiste.
            </p>
          )}
          <label className="flex cursor-pointer items-center gap-2 pl-6 text-sm text-foreground">
            <input
              type="checkbox"
              checked={sounds}
              disabled={!enabled}
              onChange={(e) => setPttSounds(e.target.checked)}
              className="size-4 accent-primary disabled:opacity-50"
            />
            Som curto ao abrir e fechar o microfone
          </label>
          <p className="pl-6 text-xs text-muted-foreground">
            O microfone só abre enquanto a tecla está pressionada, mesmo com um jogo em primeiro plano. Os outros não veem
            você como silenciado, só deixam de ouvir.
          </p>
        </>
      ) : (
        <p className="pl-6 text-xs text-muted-foreground">Disponível só no app instalado.</p>
      )}
    </div>
  )
}

/** Indicador na sala: lembra a tecla e acende enquanto ela está pressionada. Some com o modo desligado. */
export function PushToTalkHint() {
  const enabled = useApp((s) => s.pushToTalk)
  const pressed = useApp((s) => s.pttPressed)
  const label = useApp((s) => s.pttBinding.label)
  // silenciado, sem microfone ou sem permissão de falar: a tecla não abre nada
  const silenced = useApp((s) => s.muted || s.deafened || s.noMic || !s.voiceCanSpeak)
  if (!enabled) return null
  const open = pressed && !silenced
  const text = silenced ? 'Você está silenciado' : open ? 'Microfone aberto' : null
  return (
    <div className="flex justify-center pb-2">
      <span
        role="status"
        aria-label={text ?? `Pressione ${label} para falar`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors',
          open ? 'bg-success text-white' : 'bg-secondary text-muted-foreground'
        )}
      >
        <Keyboard className="size-3.5" />
        {text ?? (
          <>
            Pressione <kbd className="font-semibold">{label}</kbd> para falar
          </>
        )}
      </span>
    </div>
  )
}
