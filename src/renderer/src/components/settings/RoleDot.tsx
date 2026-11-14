import { cn } from '@/lib/utils'

/** Bolinha com a cor do cargo (a cor vem do servidor; sem cor = bolinha neutra). */
export function RoleDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3 shrink-0 rounded-full', !color && 'bg-muted-foreground/50', className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}
