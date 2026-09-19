import { cn } from '@/lib/utils'
import { categoryLabel, statusLabel } from '@/lib/types'

const statusStyles = {
  OK: 'bg-[#E2F1E8] text-[#17693F]',
  MISMATCH: 'bg-[#F8E3E0] text-[#A32720]',
  NEEDS_REVIEW: 'bg-[#FBEBCF] text-[#8A5300]',
}

export function StatusBadge({ status, className }) {
  if (!status)
    return <span className={cn('text-sm text-[#6A7880]', className)}>Not applicable</span>
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
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
        'inline-flex rounded-full bg-[#E9E5D9] px-3 py-1 text-xs font-medium text-[#52616A]',
        className,
      )}
    >
      {categoryLabel(category)}
    </span>
  )
}
