import { useCallback, useEffect, useState } from 'react'
import { AppWindow, Loader2, Monitor, RefreshCw } from 'lucide-react'
import type { ScreenAudioChoice, ScreenSource } from '@shared/screen'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { canShareSystemAudio, closeScreenPicker, startNativeScreenShare } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

type Kind = ScreenSource['kind']

export function ScreenPicker() {
  const open = useApp((s) => s.screenPickerOpen)
  const [sources, setSources] = useState<ScreenSource[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('screen')
  const [selected, setSelected] = useState<string | null>(null)
  const [audio, setAudio] = useState(false)
  const audioAvailable = canShareSystemAudio()
  const audioChoice: ScreenAudioChoice = audio ? 'with-system-audio' : 'without-audio'

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = await window.api.screen.getSources()
      setSources(list)
      setSelected((cur) => (cur && list.some((s) => s.id === cur) ? cur : (list.find((s) => s.kind === 'screen')?.id ?? null)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível listar as telas.')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setSources(null)
    setSelected(null)
    setKind('screen')
    setAudio(false)
    void load()
  }, [open, load])

  const visible = sources?.filter((s) => s.kind === kind) ?? []
  const choice = sources?.find((s) => s.id === selected)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeScreenPicker()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compartilhar a tela</DialogTitle>
          <DialogDescription>Escolha a tela inteira ou uma janela. Todos na sala de voz vão ver.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <KindButton active={kind === 'screen'} onClick={() => setKind('screen')} icon={<Monitor />}>
            Telas
          </KindButton>
          <KindButton active={kind === 'window'} onClick={() => setKind('window')} icon={<AppWindow />}>
            Janelas
          </KindButton>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void load()} aria-label="Atualizar lista">
            <RefreshCw /> Atualizar
          </Button>
        </div>

        <div className="max-h-[50vh] min-h-48 overflow-y-auto">
          {error ? (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          ) : !sources ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="animate-spin" aria-label="Carregando" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {kind === 'screen' ? 'Nenhuma tela encontrada.' : 'Nenhuma janela aberta para compartilhar.'}
            </p>
          ) : (
            <div role="listbox" aria-label={kind === 'screen' ? 'Telas' : 'Janelas'} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visible.map((s) => (
                <button
                  key={s.id}
                  role="option"
                  aria-selected={s.id === selected}
                  onClick={() => setSelected(s.id)}
                  onDoubleClick={() => void startNativeScreenShare(s, audioChoice)}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-lg p-2 text-left ring-2 ring-transparent transition-colors hover:bg-accent/50',
                    s.id === selected && 'bg-accent/60 ring-primary'
                  )}
                >
                  <img src={s.thumbnail} alt="" className="aspect-video w-full rounded-md bg-rail object-contain" />
                  <span className="flex min-w-0 items-center gap-1.5 text-sm text-accent-foreground">
                    {s.appIcon && <img src={s.appIcon} alt="" className="size-4 shrink-0" />}
                    <span className="truncate">{s.name}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          {audioAvailable ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} className="size-4 accent-primary" />
              Compartilhar também o áudio do computador
            </label>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeScreenPicker}>
              Cancelar
            </Button>
            <Button disabled={!choice} onClick={() => choice && void startNativeScreenShare(choice, audioChoice)}>
              Compartilhar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function KindButton({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-accent-foreground [&_svg]:size-4',
        active && 'bg-accent text-accent-foreground'
      )}
    >
      {icon}
      {children}
    </button>
  )
}
