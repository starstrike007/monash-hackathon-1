import clearanceLogo from '@/assets/clearance-mark.png'
import { cn } from '@/lib/utils'

function clampPercentage(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(Math.max(0, Math.min(100, parsed)))
}

export function LoadingBoatMark({ className, alt = '' }) {
  return (
    <img
      src={clearanceLogo}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={cn('loading-boat h-9 w-9 object-contain', className)}
    />
  )
}

export function LoadingBoat({
  label = 'Loading',
  percentage,
  message,
  className,
  compact = false,
}) {
  const progress = clampPercentage(percentage)
  const progressWidth = progress === null ? null : Math.max(progress, 4)

  return (
    <div
      className={cn('w-full', compact ? 'py-2' : 'py-4', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={cn('relative mx-auto w-full', compact ? 'max-w-[220px]' : 'max-w-[360px]')}>
        <div
          className={cn(
            'relative h-3 overflow-hidden rounded-full border border-[#BFD0EE] bg-[#EDF3FF]',
            compact ? 'h-2' : 'h-3',
          )}
          role={progress === null ? undefined : 'progressbar'}
          aria-label={progress === null ? undefined : `${label} progress`}
          aria-valuemin={progress === null ? undefined : 0}
          aria-valuemax={progress === null ? undefined : 100}
          aria-valuenow={progress === null ? undefined : progress}
        >
          {progress === null ? (
            <div className="loading-track-indeterminate h-full w-2/5 rounded-full bg-[#34558F]" />
          ) : (
            <div
              className="h-full rounded-full bg-[#34558F] transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${progressWidth}%` }}
            />
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 -top-3 flex justify-center">
          <LoadingBoatMark className={compact ? 'h-7 w-7' : 'h-10 w-10'} />
        </div>
      </div>
      <div className={cn('mt-4 text-center', compact ? 'mt-3' : 'mt-4')}>
        <p
          className={cn('font-mono font-semibold text-[#1E3A70]', compact ? 'text-xs' : 'text-sm')}
        >
          {label}...{progress === null ? '' : ` ${progress}%`}
        </p>
        {message && <p className="mt-1 text-xs text-[#64748B]">{message}</p>}
      </div>
    </div>
  )
}
