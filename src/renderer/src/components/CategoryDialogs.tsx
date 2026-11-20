import { useEffect, useState, type FormEvent } from 'react'
import { FolderPlus, Loader2, X } from 'lucide-react'
import { AlertDialog, AlertDialogBackdrop, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@ui-sdk/react/alert-dialog'
import { Button } from '@ui-sdk/react/button'
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@ui-sdk/react/dialog'
import { Field, FieldError, FieldLabel } from '@ui-sdk/react/field'
import { Input } from '@ui-sdk/react/input'
import { CATEGORY_NAME_MAX_LENGTH, type ChannelCategory } from '@shared/types'
import { createCategory, deleteCategory, notify, renameCategory } from '@/lib/client'

const BACKDROP = 'fixed inset-0 bg-black/70 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0'
const CONTENT =
  'fixed inset-0 m-auto h-fit w-[min(460px,calc(100%-2rem))] rounded-lg bg-background p-6 text-foreground shadow-2xl transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none'
const SECONDARY =
  'h-9 rounded-md px-4 text-sm font-medium text-accent-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
const PRIMARY =
  'inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4'

interface CategoryNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: ChannelCategory
}

export function CategoryNameDialog({ open, onOpenChange, category }: CategoryNameDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setError(null)
    setSaving(false)
  }, [open, category])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      if (category) await renameCategory(category.id, name)
      else await createCategory(name)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a categoria')
      setSaving(false)
    }
  }

  const title = category ? 'Renomear categoria' : 'Criar categoria'
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogBackdrop className={BACKDROP} />
      <DialogContent data-glass="surface" className={CONTENT}>
        <DialogClose
          aria-label="Fechar"
          className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-5" />
        </DialogClose>
        <form onSubmit={(event) => void submit(event)} className="grid gap-5">
          <div className="flex flex-col gap-2">
            <DialogTitle className="text-xl leading-none font-semibold text-accent-foreground">{title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Categorias agrupam canais na barra lateral.</DialogDescription>
          </div>
          <Field invalid={error ? true : undefined} className="space-y-2">
            <FieldLabel className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Nome da categoria</FieldLabel>
            <div className="relative">
              <FolderPlus aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={name}
                maxLength={CATEGORY_NAME_MAX_LENGTH}
                autoFocus
                placeholder="Nova categoria"
                onValueChange={(value) => {
                  setName(value)
                  setError(null)
                }}
                className="flex h-10 w-full rounded-md border border-transparent bg-input pr-3 pl-9 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            {error && <FieldError className="text-sm text-destructive">{error}</FieldError>}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose className={SECONDARY}>Cancelar</DialogClose>
            <Button type="submit" disabled={saving || !name.trim()} className={PRIMARY}>
              {saving && <Loader2 className="animate-spin" />}
              {category ? 'Salvar' : 'Criar categoria'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface DeleteCategoryDialogProps {
  category: ChannelCategory | null
  onOpenChange: (open: boolean) => void
}

export function DeleteCategoryDialog({ category, onOpenChange }: DeleteCategoryDialogProps) {
  return (
    <AlertDialog open={category !== null} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialogBackdrop className={BACKDROP} />
      <AlertDialogContent data-glass="surface" className={CONTENT}>
        <AlertDialogTitle className="text-base font-bold text-accent-foreground">Apagar a categoria “{category?.name}”?</AlertDialogTitle>
        <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
          Os canais dela continuam e vão para o topo da lista, sem categoria.
        </AlertDialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <AlertDialogClose className={SECONDARY}>Cancelar</AlertDialogClose>
          <AlertDialogClose
            value="confirm"
            action={() =>
              category
                ? deleteCategory(category.id).catch((err: unknown) => notify(err instanceof Error ? err.message : 'Não foi possível apagar a categoria'))
                : undefined
            }
            className="h-9 rounded-lg bg-destructive px-4 text-sm font-semibold text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-pending:opacity-60"
          >
            Apagar
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
