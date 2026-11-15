/**
 * Miniatura de um tema (galeria e prévia do editor): uma "janela" do app desenhada com as cores DERIVADAS do
 * próprio tema (barra, lista de canais, chat com o gradiente e um botão na cor de destaque). As cores vêm do
 * tema em tempo de execução, por isso o `style` (não há cor fixa no componente).
 */
import type { ThemeConfig } from '@shared/types'
import { deriveTokens } from '@/lib/theme/derive'
import { cn } from '@/lib/utils'

export function ThemeSwatch({ theme, className }: { theme: ThemeConfig; className?: string }) {
  const { tokens: t, gradient } = deriveTokens(theme)
  return (
    <div className={cn('flex h-16 w-full overflow-hidden rounded-md border border-border', className)} aria-hidden>
      <div className="w-3" style={{ background: t.rail }} />
      <div className="flex w-1/4 flex-col gap-1 p-1" style={{ background: t.sidebar }}>
        <span className="h-1 w-3/4 rounded-sm" style={{ background: t['sidebar-foreground'] }} />
        <span className="h-1 w-1/2 rounded-sm" style={{ background: t['sidebar-foreground'] }} />
      </div>
      <div
        className="flex flex-1 flex-col justify-between p-1.5"
        style={{ backgroundColor: t.background, backgroundImage: gradient === 'none' ? undefined : gradient }}
      >
        <div className="flex flex-col gap-1">
          <span className="h-1 w-2/3 rounded-sm" style={{ background: t.foreground }} />
          <span className="h-1 w-1/3 rounded-sm" style={{ background: t['muted-foreground'] }} />
        </div>
        <span className="h-2 w-6 self-end rounded-sm" style={{ background: t.primary }} />
      </div>
    </div>
  )
}
