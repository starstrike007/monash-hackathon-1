import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react'

export function BackendError({ error, onRetry, compact = false }) {
  const message = error?.message || 'Backend unreachable. Start the FastAPI service and try again.'
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-[#FECACA] bg-[#FEE2E2] text-[#991B1B] ${compact ? 'p-4' : 'p-6'}`}
    >
      <div className="flex items-start gap-3">
        <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Backend unavailable</p>
          <p className="mt-1 text-sm leading-5">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-[#B4C8EC] bg-[#E6EEFC] px-3 text-sm font-semibold text-[#0F172A] hover:bg-[#D6E3FA]"
            >
              <ArrowClockwise size={15} />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
