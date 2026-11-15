/**
 * "Aparência" (v5, B12): galeria dos temas prontos, meus temas salvos, editor com resultado ao vivo e
 * compartilhar por código. Cada ajuste aplica o tema na hora (`setTheme`, que agrupa o envio ao servidor);
 * fechar a janela manda o que estiver pendente.
 */
import { useState } from 'react'
import { Copy, Plus, Trash2, X } from 'lucide-react'
import { decodeThemeCode, encodeThemeCode, THEME_STOPS_MAX, type ThemeConfig } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { flushPendingTheme, notify, saveThemes, setTheme } from '@/lib/client'
import { addSavedTheme, addStop, copyName, removeSavedTheme, removeStop, sameTheme, setStop } from '@/lib/theme/editor'
import { THEME_PRESETS } from '@/lib/theme/presets'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { ThemeSwatch } from './ThemeSwatch'

const sectionTitle = 'mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase'

function ThemeCard({ name, theme, active, onPick }: { name: string; theme: ThemeConfig; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={cn(
        'flex flex-col gap-1 rounded-lg border-2 p-1.5 text-left text-xs font-medium text-foreground hover:bg-accent/40',
        active ? 'border-primary' : 'border-transparent'
      )}
    >
      <ThemeSwatch theme={theme} />
      <span className="truncate px-0.5">{name}</span>
    </button>
  )
}

export function AppearanceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const theme = useApp((s) => s.theme)
  const saved = useApp((s) => s.savedThemes)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const change = (next: ThemeConfig): void => {
    setError(null)
    setTheme(next)
  }

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar')
    } finally {
      setBusy(false)
    }
  }

  const saveCurrent = (): void => {
    const next = addSavedTheme(saved, name, theme)
    if (typeof next === 'string') return setError(next)
    void run(async () => {
      await saveThemes(next)
      setName('')
    })
  }

  const applyCode = (): void => {
    const decoded = decodeThemeCode(code)
    if (!decoded) return setError('Código de tema inválido. Ele começa com "concord-tema:".')
    change(decoded)
    setCode('')
  }

  const copyCode = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(encodeThemeCode(theme))
      notify('Código do tema copiado. Cole para um amigo usar o mesmo tema.', 'info')
    } catch {
      setError('Não foi possível copiar. Selecione o código e copie manualmente.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void flushPendingTheme()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Aparência</DialogTitle>
          <DialogDescription>Escolha um tema pronto ou crie o seu. O tema acompanha sua conta em qualquer computador.</DialogDescription>
        </DialogHeader>

        <section>
          <h3 className={sectionTitle}>Temas prontos</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {THEME_PRESETS.map((p) => (
              <ThemeCard key={p.id} name={p.name} theme={p.theme} active={sameTheme(p.theme, theme)} onPick={() => change(p.theme)} />
            ))}
          </div>
        </section>

        <section>
          <h3 className={sectionTitle}>Meus temas ({saved.length}/10)</h3>
          {saved.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ajuste um tema abaixo e salve com um nome para usar de novo depois.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {saved.map((s) => (
                <li key={s.id} className="flex flex-col gap-1">
                  <ThemeCard name={s.name} theme={s.theme} active={sameTheme(s.theme, theme)} onPick={() => change(s.theme)} />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      aria-label={`Duplicar ${s.name}`}
                      onClick={() => {
                        const next = addSavedTheme(saved, copyName(s.name), s.theme)
                        if (typeof next === 'string') return setError(next)
                        void run(() => saveThemes(next))
                      }}
                    >
                      <Copy /> Duplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Apagar ${s.name}`}
                      onClick={() => void run(() => saveThemes(removeSavedTheme(saved, s.id)))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h3 className={sectionTitle}>Personalizar</h3>
          <ThemeSwatch theme={theme} className="h-24" />

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-1" role="group" aria-label="Base do tema">
              {(['escuro', 'claro'] as const).map((b) => (
                <Button
                  key={b}
                  size="sm"
                  variant={theme.base === b ? 'default' : 'secondary'}
                  aria-pressed={theme.base === b}
                  aria-label={b === 'escuro' ? 'Base escura' : 'Base clara'}
                  onClick={() => change({ ...theme, base: b })}
                >
                  {b === 'escuro' ? 'Escuro' : 'Claro'}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              Destaque
              <input
                type="color"
                aria-label="Cor de destaque"
                value={theme.accent}
                onChange={(e) => change({ ...theme, accent: e.target.value.toLowerCase() })}
                className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-foreground">Gradiente</span>
            {theme.background.stops.map((stop, i) => (
              <span key={i} className="flex items-center">
                <input
                  type="color"
                  aria-label={`Cor ${i + 1} do gradiente`}
                  value={stop}
                  onChange={(e) => change(setStop(theme, i, e.target.value))}
                  className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                />
                {theme.background.stops.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Tirar a cor ${i + 1}`}
                    onClick={() => change(removeStop(theme, i))}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            ))}
            {theme.background.stops.length < THEME_STOPS_MAX && (
              <Button size="sm" variant="secondary" onClick={() => change(addStop(theme))}>
                <Plus /> Cor
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 text-sm text-foreground">
              <span className="w-20">Ângulo</span>
              <input
                type="range"
                min={0}
                max={360}
                value={theme.background.angle}
                aria-label="Ângulo do gradiente"
                onChange={(e) => change({ ...theme, background: { ...theme.background, angle: Number(e.target.value) } })}
                className="flex-1 accent-primary"
              />
              <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{theme.background.angle}°</span>
            </label>
            <label className="flex items-center gap-3 text-sm text-foreground">
              <span className="w-20">Intensidade</span>
              <input
                type="range"
                min={0}
                max={100}
                value={theme.intensity}
                aria-label="Intensidade do gradiente"
                onChange={(e) => change({ ...theme, intensity: Number(e.target.value) })}
                className="flex-1 accent-primary"
              />
              <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{theme.intensity}%</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Nome do tema"
              aria-label="Nome do tema"
              value={name}
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveCurrent()}
            />
            <Button disabled={busy} onClick={saveCurrent}>
              Salvar tema
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className={sectionTitle}>Compartilhar</h3>
          <div className="flex gap-2">
            <Input readOnly aria-label="Código do tema atual" value={encodeThemeCode(theme)} onFocus={(e) => e.target.select()} />
            <Button variant="secondary" onClick={() => void copyCode()}>
              <Copy /> Copiar
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Cole aqui o código de um amigo"
              aria-label="Código de tema para usar"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyCode()}
            />
            <Button variant="secondary" disabled={!code.trim()} onClick={applyCode}>
              Usar código
            </Button>
          </div>
        </section>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
