import { useEffect, useState } from 'react'

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

/**
 * Loads that arrive in one request have no real progress to report, so this eases toward 95%
 * and stays there until the loader disappears. Loads with real progress pass `percentage`.
 */
function useEstimatedProgress(enabled) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000
      setValue(95 * (1 - Math.exp(-seconds / 1.8)))
    }, 120)
    return () => window.clearInterval(timer)
  }, [enabled])

  return value
}

/** Cycles through `phrases` every few seconds, starting with the first and never repeating twice. */
function useRotatingPhrase(phrases, fallback, intervalMs = 2800) {
  const [index, setIndex] = useState(0)
  const count = phrases?.length || 0

  useEffect(() => {
    if (count < 2) return undefined
    const timer = window.setInterval(() => {
      setIndex((current) => {
        let next = Math.floor(Math.random() * count)
        if (next === current) next = (next + 1) % count
        return next
      })
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [count, intervalMs])

  return count ? phrases[index % count] : fallback
}

export function LoadingBoat({
  label = 'Loading',
  phrases,
  percentage,
  message,
  className,
  compact = false,
}) {
  const hasRealProgress = percentage !== undefined && percentage !== null
  const estimated = useEstimatedProgress(!hasRealProgress)
  const phrase = useRotatingPhrase(phrases, label)
  const progress = clampPercentage(hasRealProgress ? percentage : estimated)
  const progressWidth = progress === null ? null : Math.max(progress, 4)

  return (
    <div
      className={cn('w-full', compact ? 'py-2' : 'py-4', className)}
      role="status"
      aria-busy="true"
    >
      <div className={cn('mx-auto w-full', compact ? 'max-w-[220px]' : 'max-w-[360px]')}>
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
      </div>
      <div className={cn('text-center', compact ? 'mt-3' : 'mt-4')}>
        {/* The visible wording changes every few seconds, so screen readers get the fixed label. */}
        <span className="sr-only">{label}</span>
        <p
          aria-hidden="true"
          className={cn('font-mono font-semibold text-[#1E3A70]', compact ? 'text-xs' : 'text-sm')}
        >
          <span key={phrase} className="loading-phrase inline-block">
            {phrase}...
          </span>
          {progress === null ? '' : ` ${progress}%`}
        </p>
        {message && <p className="mt-1 text-xs text-[#64748B]">{message}</p>}
      </div>
    </div>
  )
}
