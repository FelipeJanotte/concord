import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export function IconButton({ label, onClick, children, danger, side = 'top', className }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className={cn(
            'text-muted-foreground hover:text-accent-foreground [&_svg]:size-[18px]',
            danger && 'text-destructive hover:text-destructive',
            className
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
