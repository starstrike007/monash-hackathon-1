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
    <section className="rounded-2xl border border-[#E3DED1] bg-white p-6">
      <div className="flex items-center gap-4">
        <span
          className={cn(
            'grid h-12 w-12 shrink-0 place-items-center rounded-full',
            complete
              ? 'bg-[#E2F1E8] text-[#17693F]'
              : failed
                ? 'bg-[#FBEBCF] text-[#8A5300]'
                : 'bg-[#E9E5D9] text-[#71808A]',
          )}
        >
          {complete ? (
            <CheckCircle size={25} weight="fill" />
          ) : failed ? (
            <Warning size={24} weight="fill" />
          ) : (
            <CircleNotch size={24} className="animate-spin" />
          )}
        </span>
        <h2 className="text-xl font-semibold text-[#26353D]">
          {stage.stage_number} · {stage.stage_name}
        </h2>
        <span className="ml-auto rounded-full bg-[#E9E5D9] px-3 py-1 text-sm text-[#46555E]">
          {stage.stage_number <= 2 ? 'Rules + OpenAI' : 'Rule-based'}
        </span>
      </div>
      <div className="mt-5 h-3 rounded-full bg-[#E9E5D9]">
        <div
          className="h-3 rounded-full bg-[#0E5A66] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-4 flex justify-between gap-6 text-sm text-[#62757D]">
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
        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[#F2C2BC] bg-[#F8E3E0] p-4">
          <div>
            <p className="font-semibold text-[#A32720]">Item failed</p>
            <p className="mt-1 text-sm text-[#8C2A24]">{stage.details.failure}</p>
          </div>
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
      <aside className="relative h-full w-full max-w-[720px] overflow-y-auto bg-[#FBF9F4] px-6 py-8 shadow-2xl sm:px-10">
        <button
          className="absolute right-6 top-6 grid h-12 w-12 place-items-center rounded-xl border border-[#D5D0C2] bg-white text-[#26353D]"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={24} />
        </button>
        <p className="text-lg text-[#62757D]">Started 09:41 · {run?.total_emails || 520} emails</p>
        <h1 className="mt-1 font-serif text-5xl font-semibold tracking-tight text-[#16232B]">
          Pipeline run
        </h1>
        {run?.status === 'failed' && (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-[#EBCB83] bg-[#FBEBCF] p-5 text-[#5A3A08]">
            <Warning size={25} />
            <p>
              <strong>Run complete.</strong> Some items failed and can be retried.
            </p>
          </div>
        )}
        <div className="mt-8 space-y-6">
          {run?.stages?.map((stage) => <StageCard key={stage.stage_number} stage={stage} />) || (
            <div className="h-72 animate-pulse rounded-2xl bg-white" />
          )}
        </div>
        {run?.failures?.length ? (
          <div className="mt-6 rounded-2xl border border-[#F2C2BC] bg-[#F8E3E0] p-5">
            <p className="font-semibold text-[#A32720]">
              {run.failures[0].email_id.toUpperCase()} failed
            </p>
            <p className="mt-1 text-sm text-[#8C2A24]">{run.failures[0].message}</p>
          </div>
        ) : null}
        <div className="sticky bottom-0 mt-8 flex gap-3 bg-[#FBF9F4] py-3">
          <button
            className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0E5A66] font-semibold text-white disabled:opacity-60"
            onClick={retry}
            disabled={retrying || !run?.failures?.length}
          >
            <ArrowClockwise size={20} />
            {retrying ? 'Retrying…' : `Retry failed (${run?.failures?.length || 0})`}
          </button>
          <button
            className="h-14 rounded-xl border border-[#D5D0C2] bg-white px-7 font-semibold text-[#26353D]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  )
}
