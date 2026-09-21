import { useEffect, useState } from 'react'
import { CheckCircle, CircleNotch, Warning, X } from '@phosphor-icons/react'

import { BackendError } from '@/components/BackendError'
import { getPipelineRun, notifyDataChanged, retryEmail } from '@/lib/api'
import { formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

function StageCard({ stage }) {
  const complete = stage.status === 'complete'
  const failed = stage.status === 'partial' || stage.status === 'failed'
  const progress = stage.total_count
    ? Math.min(100, Math.round((stage.processed_count / stage.total_count) * 100))
    : complete
      ? 100
      : 0
  return (
    <section className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-full',
            complete
              ? 'bg-[#D1FAE5] text-[#047857]'
              : failed
                ? 'bg-[#FEF3C7] text-[#B45309]'
                : 'bg-[#E2E8F0] text-[#64748B]',
          )}
        >
          {complete ? (
            <CheckCircle size={18} weight="fill" />
          ) : failed ? (
            <Warning size={17} weight="fill" />
          ) : (
            <CircleNotch size={17} className="animate-spin" />
          )}
        </span>
        <h2 className="text-sm font-semibold text-[#1E293B]">
          {stage.stage_number} · {stage.stage_name}
        </h2>
        <span className="ml-auto rounded-full bg-[#E2E8F0] px-2 py-0.5 text-[11px] text-[#475569]">
          {stage.stage_number <= 2 ? 'Rules + OpenAI' : 'Rule-based'}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-[#E2E8F0]">
        <div
          className="h-1.5 rounded-full bg-[#0F172A] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between gap-3 text-xs text-[#64748B]">
        <span>
          {stage.processed_count} of {stage.total_count}{' '}
          {stage.stage_number === 1
            ? 'classified'
            : stage.stage_number === 2
              ? 'pairs extracted'
              : stage.stage_number === 3
                ? 'compared'
                : 'statuses assigned'}
        </span>
        <span className="text-right">
          {stage.failed_count ? `${stage.failed_count} failed · ` : ''}
          {stage.review_count ? `${stage.review_count} routed to review` : `${progress}% complete`}
        </span>
      </div>
      {stage.details?.failure && (
        <div className="mt-1.5 rounded-md border border-[#FECACA] bg-[#FEE2E2] p-1.5">
          <p className="text-xs font-semibold text-[#B91C1C]">Item failed</p>
          <p className="line-clamp-2 text-xs text-[#991B1B]">{stage.details.failure}</p>
        </div>
      )}
    </section>
  )
}

export function PipelineRunDrawer({ runId, onClose }) {
  const [run, setRun] = useState(null)
  const [retryingEmailId, setRetryingEmailId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const value = await getPipelineRun(runId)
        if (active) {
          setError(null)
          setRun(value)
        }
      } catch (reason) {
        if (active) setError(reason)
      }
    }
    load()
    const timer = window.setInterval(load, 2500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [runId])

  async function retry(failure) {
    if (!failure) return
    setRetryingEmailId(failure.email_id)
    setError(null)
    try {
      const retried = await retryEmail(failure.email_id)
      notifyDataChanged()
      const updated = await getPipelineRun(retried.run_id || runId)
      setRun(updated)
    } catch (reason) {
      setError(reason)
    } finally {
      setRetryingEmailId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        className="absolute inset-0 bg-[#0F172A]/35"
        onClick={onClose}
        aria-label="Close pipeline run"
      />
      <aside className="relative flex h-full w-full max-w-[440px] flex-col bg-[#F8FAFC] px-4 py-4 shadow-xl sm:px-5">
        <button
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg border border-[#0F172A] bg-transparent text-[#0F172A] hover:bg-slate-100 transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <p className="text-xs text-[#64748B]">
          Started {run?.started_at ? formatDate(run.started_at) : '—'} · {run?.total_emails ?? '—'}{' '}
          emails
        </p>
        <h1 className="font-display mt-0.5 text-2xl font-semibold tracking-[-0.01em] text-[#0F172A]">
          Pipeline run
        </h1>
        {error && (
          <div className="mt-3">
            <BackendError error={error} compact onRetry={() => setError(null)} />
          </div>
        )}
        {run?.status === 'failed' && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#FCD34D] bg-[#FEF3C7] p-2 text-xs text-[#78350F]">
            <Warning size={16} />
            <p>
              <strong>Run complete.</strong> Some items failed and can be retried.
            </p>
          </div>
        )}
        <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
          {run?.stages?.map((stage) => <StageCard key={stage.stage_number} stage={stage} />) || (
            <div className="h-40 animate-pulse rounded-lg bg-white" />
          )}
        </div>
        {run?.failures?.length ? (
          <div className="mt-1.5 space-y-2 rounded-lg border border-[#FECACA] bg-[#FEE2E2] p-2">
            {run.failures.map((failure) => (
              <div key={failure.email_id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#B91C1C]">
                    {failure.email_id.toUpperCase()} failed
                  </p>
                  <p className="line-clamp-2 text-xs text-[#991B1B]">{failure.message}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#991B1B] disabled:opacity-60"
                  onClick={() => retry(failure)}
                  disabled={retryingEmailId !== null}
                >
                  {retryingEmailId === failure.email_id ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex gap-2">
          <button
            className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold leading-none transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100 border border-[#0F172A] bg-transparent text-[#0F172A] hover:bg-slate-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}
