import type { CustomStatus } from '@shared/types'
import { customStatusLabel, useActiveCustomStatus } from '@/lib/custom-status'
import { cn } from '@/lib/utils'

export function CustomStatusText({ status, className }: { status: CustomStatus | null | undefined; className?: string }) {
  const active = useActiveCustomStatus(status)
  if (!active) return null
  const label = customStatusLabel(active)
  return (
    <span data-custom-status title={label} className={cn('block truncate text-xs text-muted-foreground', className)}>
      {label}
    </span>
  )
}
