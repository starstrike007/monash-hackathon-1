import { useEffect, useState } from 'react'
import { ArrowClockwise, CheckCircle, CircleNotch, Warning, X } from '@phosphor-icons/react'

import { getPipelineRun, retryEmail } from '@/lib/api'
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
    <section className="rounded-lg border border-[#E3DED1] bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-full',
            complete
              ? 'bg-[#E2F1E8] text-[#17693F]'
              : failed
                ? 'bg-[#FBEBCF] text-[#8A5300]'
                : 'bg-[#E9E5D9] text-[#71808A]',
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
        <h2 className="text-sm font-semibold text-[#26353D]">
          {stage.stage_number} · {stage.stage_name}
        </h2>
        <span className="ml-auto rounded-full bg-[#E9E5D9] px-2 py-0.5 text-[11px] text-[#46555E]">
          {stage.stage_number <= 2 ? 'Rules + OpenAI' : 'Rule-based'}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-[#E9E5D9]">
        <div
          className="h-1.5 rounded-full bg-[#0E5A66] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between gap-3 text-xs text-[#62757D]">
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
        <div className="mt-1.5 rounded-md border border-[#F2C2BC] bg-[#F8E3E0] p-1.5">
          <p className="text-xs font-semibold text-[#A32720]">Item failed</p>
          <p className="line-clamp-2 text-xs text-[#8C2A24]">{stage.details.failure}</p>
        </div>
      )}
    </section>
  )
}

export function PipelineRunDrawer({ runId, onClose }) {
  const [run, setRun] = useState(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const value = await getPipelineRun(runId)
      if (active) setRun(value)
    }
    load()
    const timer = window.setInterval(load, 2500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [runId])

  async function retry() {
    const failure = run?.failures?.[0]
    if (!failure) return
    setRetrying(true)
    const retried = await retryEmail(failure.email_id)
    const updated = await getPipelineRun(retried.run_id || runId)
    setRun(updated)
    setRetrying(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        className="absolute inset-0 bg-[#16232B]/35"
        onClick={onClose}
        aria-label="Close pipeline run"
      />
      <aside className="relative flex h-full w-full max-w-[440px] flex-col bg-[#FBF9F4] px-4 py-4 shadow-2xl sm:px-5">
        <button
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg bg-white text-[#26353D] shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <p className="text-xs text-[#62757D]">Started 09:41 · {run?.total_emails || 520} emails</p>
        <h1 className="mt-0.5 font-serif text-2xl font-semibold tracking-tight text-[#16232B]">
          Pipeline run
        </h1>
        {run?.status === 'failed' && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#EBCB83] bg-[#FBEBCF] p-2 text-xs text-[#5A3A08]">
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
          <div className="mt-1.5 rounded-lg border border-[#F2C2BC] bg-[#F8E3E0] p-2">
            <p className="text-xs font-semibold text-[#A32720]">
              {run.failures[0].email_id.toUpperCase()} failed
            </p>
            <p className="line-clamp-2 text-xs text-[#8C2A24]">{run.failures[0].message}</p>
          </div>
        ) : null}
        <div className="mt-2 flex gap-2">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold leading-none transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100 flex-1 bg-[#0E5A66] text-white hover:bg-[#0B4B55] disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none"
            onClick={retry}
            disabled={retrying || !run?.failures?.length}
          >
            <ArrowClockwise size={16} className="shrink-0" />
            {retrying ? 'Retrying…' : `Retry failed (${run?.failures?.length || 0})`}
          </button>
          <button
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold leading-none transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100 bg-white text-[#26353D] shadow-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}
