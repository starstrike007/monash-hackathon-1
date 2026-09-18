import * as React from 'react'

import { cn } from '@/lib/utils'

const Progress = React.forwardRef(({ className, value = 0, ...props }, ref) => (
  <div
    ref={ref}
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={value}
    className={cn('relative h-2 w-full overflow-hidden rounded-full bg-[#F0F0F0]', className)}
    {...props}
  >
    <div className="h-full bg-[#FD6100] transition-all" style={{ width: `${value}%` }} />
  </div>
))
Progress.displayName = 'Progress'

export { Progress }
