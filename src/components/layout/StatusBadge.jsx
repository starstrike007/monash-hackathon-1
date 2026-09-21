import { cn } from '@/lib/utils'
import { categoryLabel, statusLabel } from '@/lib/types'

const statusStyles = {
  OK: 'bg-[#D1FAE5] text-emerald-700',
  MISMATCH: 'bg-[#FEE2E2] text-red-700',
  NEEDS_REVIEW: 'bg-[#FEF3C7] text-amber-700',
}

export function StatusBadge({ status, className }) {
  if (!status)
    return <span className={cn('text-sm text-[#64748B]', className)}>Not applicable</span>
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs font-medium',
        statusStyles[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  )
}

export function CategoryBadge({ category, className }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600',
        className,
      )}
    >
      {categoryLabel(category)}
    </span>
  )
}
