import type { ReactNode } from 'react'
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { cn } from '@/lib/utils'

export function PokemonDialog({
  open,
  onOpenChange,
  title,
  wide = false,
  children
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogBackdrop className="fixed inset-0 z-40 bg-background/70 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent
        className={cn(
          'px-ui px-window fixed inset-0 z-50 m-auto h-fit max-h-[90vh] overflow-y-auto p-5 text-popover-foreground transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0',
          wide ? 'w-[min(720px,calc(100%-2rem))]' : 'w-[min(460px,calc(100%-2rem))]'
        )}
      >
        <DialogTitle className="px-title mb-4 text-base">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}
