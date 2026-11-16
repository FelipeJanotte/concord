import { ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

/** Imagem em tamanho grande, com link para abrir o original no navegador. */
export function ImageLightbox({
  src,
  name,
  open,
  onOpenChange
}: {
  src: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-glass="none" className="max-w-[90vw] gap-2 border-none bg-transparent p-0 shadow-none sm:max-w-[90vw]">
        <DialogTitle className="sr-only">{name}</DialogTitle>
        <DialogDescription className="sr-only">Imagem ampliada</DialogDescription>
        <img src={src} alt={name} className="max-h-[80vh] max-w-full rounded-md object-contain" />
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-accent-foreground hover:underline"
        >
          Abrir original <ExternalLink className="size-3.5" />
        </a>
      </DialogContent>
    </Dialog>
  )
}
