import { useEffect, useState, type FormEvent } from 'react'
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from '@ui-sdk/react/alert-dialog'
import { Button } from '@ui-sdk/react/button'
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { Field, FieldError, FieldLabel } from '@ui-sdk/react/field'
import { Input } from '@ui-sdk/react/input'
import { CATEGORY_NAME_MAX_LENGTH, type ChannelCategory } from '@shared/types'
import { createCategory, deleteCategory, notify, renameCategory } from '@/lib/client'

const BACKDROP = 'bg-background/70 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0'
const CONTENT =
  'w-[min(420px,90vw)] rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none'
const SECONDARY =
  'h-9 rounded-lg px-4 text-sm text-foreground hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
const PRIMARY =
  'h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60'

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
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <DialogTitle className="text-base font-bold text-accent-foreground">{title}</DialogTitle>
          <Field invalid={error ? true : undefined} className="flex flex-col gap-1.5">
            <FieldLabel className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Nome da categoria</FieldLabel>
            <Input
              value={name}
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              autoFocus
              placeholder="Nova categoria"
              onValueChange={(value) => {
                setName(value)
                setError(null)
              }}
              className="h-9 rounded-lg border border-border bg-input px-3 text-sm text-foreground outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20"
            />
            {error && <FieldError className="text-sm text-destructive">{error}</FieldError>}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose className={SECONDARY}>Cancelar</DialogClose>
            <Button type="submit" disabled={saving || !name.trim()} className={PRIMARY}>
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
