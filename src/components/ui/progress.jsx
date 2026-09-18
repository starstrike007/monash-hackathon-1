import * as React from 'react'

import { cn } from '@/lib/utils'

const Progress = React.forwardRef(({ className, value = 0, ...props }, ref) => (
  <div
    ref={ref}
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={value}
    className={cn('relative h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800', className)}
    {...props}
  >
    <div className="h-full bg-slate-900 transition-all dark:bg-slate-200" style={{ width: `${value}%` }} />
  </div>
))
Progress.displayName = 'Progress'

export { Progress }
