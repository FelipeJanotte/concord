// Moldura comum dos cartões de resultado das ferramentas no chat (B10): ícone + título e o conteúdo.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function CardFrame({
  icon,
  title,
  label,
  children,
  className
}: {
  icon: ReactNode
  title: string
  /** nome acessível do cartão (leitores de tela e testes); padrão = título */
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={label ?? title}
      className={cn('mt-1 max-w-lg rounded-lg border border-border bg-panel p-3 text-foreground', className)}
    >
      <header className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
        {icon}
        <span>{title}</span>
      </header>
      {children}
    </section>
  )
}
