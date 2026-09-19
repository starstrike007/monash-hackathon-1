import { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  CaretDown,
  ChartBar,
  Clock,
  Play,
  WarningCircle,
} from '@phosphor-icons/react'

import { CategoryPie } from '@/components/charts/CategoryPie'
import { DefectsByField, defectTotal } from '@/components/charts/DefectsByField'
import { PipelineRunDrawer } from '@/features/pipeline-run/PipelineRunDrawer'
import { getDashboard, getPipelineRun, runPipeline, submissionUrl } from '@/lib/api'
import { relativeTime } from '@/lib/time'
import { FIELDS, STATUS } from '@/lib/types'
import { cn } from '@/lib/utils'

function SummaryCard({ label, value, caption, warning = false, compact = false }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[#E3DED1] bg-white shadow-[0_1px_1px_rgba(22,35,43,0.03)]',
        compact ? 'p-5' : 'p-6',
        warning && 'border-[#EBCB83] bg-[#FBEBCF]',
      )}
    >
      <p className={cn('text-sm font-medium text-[#687780]', warning && 'text-[#8A5300]')}>
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-mono font-semibold tracking-tight text-[#16232B]',
          compact ? 'text-4xl' : 'text-5xl',
          warning && 'text-[#8A5300]',
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          'text-sm text-[#687780]',
          compact ? 'mt-2' : 'mt-3',
          warning && 'font-medium text-[#8A5300]',
        )}
      >
        {caption}
      </p>
    </div>
  )
}

function useRelativeTime(value, intervalMs = 30000) {
  const [label, setLabel] = useState(() => relativeTime(value))

  useEffect(() => {
    setLabel(relativeTime(value))
    const timer = setInterval(() => setLabel(relativeTime(value)), intervalMs)
    return () => clearInterval(timer)
  }, [value, intervalMs])

  return label
}

const TONES = {
  critical: '#CF3B32',
  warning: '#C47A00',
  positive: '#2B965C',
  neutral: '#0E5A66',
}

function buildInsights(data) {
  const ok = data.outcomes?.OK || 0
  const mismatch = data.outcomes?.MISMATCH || 0
  const review = data.outcomes?.NEEDS_REVIEW || 0
  const total = ok + mismatch + review || 1
  const compared = ok + mismatch || 1

  const defects = Object.entries(data.defects_by_field || {}).sort((a, b) => b[1] - a[1])
  const defectTotal = defects.reduce((sum, [, value]) => sum + value, 0) || 1
  const [topField, topCount] = defects[0] || ['', 0]
  const topTwoShare = Math.round(
    (defects.slice(0, 2).reduce((sum, [, value]) => sum + value, 0) / defectTotal) * 100,
  )
  const fieldLabel = (key) => FIELDS.find((field) => field.key === key)?.label || key

  const mismatchRate = Math.round((mismatch / compared) * 100)
  const autoRate = Math.round((compared / total) * 100)
  const reviewRate = Math.round((review / total) * 100)
  const routedRate = Math.round(
    ((data.comparison_requests || 0) / (data.emails_processed || 1)) * 100,
  )

  const insights = [
    {
      key: 'mismatch-rate',
      tone: mismatchRate >= 30 ? 'critical' : 'warning',
      claim: `${mismatchRate}% of compared pairs failed`,
      detail: `${mismatch} of ${compared} fully compared SI/BL pairs differ on at least one field — well above a clean-draft baseline.`,
    },
    {
      key: 'top-defect',
      tone: 'critical',
      claim: `${fieldLabel(topField)} is the single biggest defect`,
      detail: `${topCount} mismatches. With ${fieldLabel(defects[1]?.[0] || '')} it accounts for ${topTwoShare}% of all field defects — fixing the SI intake for these two fields removes most of the queue.`,
    },
    {
      key: 'automation',
      tone: 'positive',
      claim: `${autoRate}% resolved without a person`,
      detail: `${compared} of ${total} comparison requests reached a definitive OK or mismatch verdict automatically.`,
    },
    {
      key: 'review-load',
      tone: 'warning',
      claim: `${review} cases (${reviewRate}%) are waiting on a human`,
      detail:
        'Escalated for unreadable scans or missing attachments rather than a detected defect — these never get silently passed as clean.',
    },
    {
      key: 'routing',
      tone: 'neutral',
      claim: `Only ${routedRate}% of the inbox needs checking`,
      detail: `${data.comparison_requests} of ${data.emails_processed} emails were comparison requests; the rest were filtered out before any document work.`,
    },
  ]

  return insights
}

function SummaryBrief({ data, navigate, lastRunAt }) {
  const insights = buildInsights(data)
  const lastRun = useRelativeTime(lastRunAt)

  return (
    <section className="rounded-2xl border border-[#E3DED1] bg-white p-7">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(400px,0.78fr)]">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-[#16232B]">Summary brief</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F6F3EC] px-3 py-1 text-xs font-medium text-[#71808A]">
              <Clock size={13} />
              Latest run
              {lastRun && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#46555E]">{lastRun}</span>
                </>
              )}
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#46555E]">
            This run read {data.emails_processed} emails and checked {data.comparison_requests}{' '}
            SI/BL comparison requests. Draft quality is the story: mismatches are concentrated in a
            handful of fields, and the small review queue is driven by unreadable or missing
            documents rather than by the checker being unsure.
          </p>

          <ul className="mt-6 space-y-4">
            {insights.map((insight) => (
              <li className="flex gap-3" key={insight.key}>
                <span
                  className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-current"
                  style={{ color: TONES[insight.tone] }}
                />
                <p className="text-sm leading-relaxed text-[#71808A]">
                  <strong className="font-semibold text-[#26353D]">{insight.claim}.</strong>{' '}
                  {insight.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="h-fit">
          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryCard
              compact
              label="Emails processed"
              value={data.emails_processed}
              caption={`${data.comparison_requests} with attachments`}
            />
            <SummaryCard
              compact
              label="Comparison requests"
              value={data.comparison_requests}
              caption={`${data.comparison_requests - 2} SI/BL pairs · 2 missing attachment`}
            />
            <SummaryCard
              compact
              label="Mismatches found"
              value={data.mismatches_found}
              caption={`Across ${data.comparison_requests - data.needs_review} fully compared pairs`}
            />
            <SummaryCard
              compact
              label="Needs review"
              value={data.needs_review}
              caption="Open review queue →"
              warning
            />
          </div>

          <button
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#0E5A66] bg-[#0E5A66] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0B4A54]"
            onClick={() => navigate('/review')}
          >
            Open review queue
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  )
}

function SectionCard({ title, subtitle, children, className }) {
  return (
    <section className={cn('rounded-2xl border border-[#E3DED1] bg-white p-7', className)}>
      <h2 className="text-xl font-semibold tracking-tight text-[#16232B]">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-[#71808A]">{subtitle}</p>}
      {children}
    </section>
  )
}

function OutcomeBreakdown({ outcomes }) {
  const rows = [
    ['OK', 'No mismatch', '#2B965C', 'all 7 fields agree'],
    ['MISMATCH', 'Mismatch', '#CF3B32', 'at least one field differs'],
    ['NEEDS_REVIEW', 'Needs review', '#C47A00', 'a person decides'],
  ]
  const total = rows.reduce((sum, [key]) => sum + (outcomes?.[key] || 0), 0) || 1
  return (
    <div className="mt-6">
      <div className="flex h-8 overflow-hidden rounded-lg">
        {rows.map(([key, , color]) => (
          <div
            key={key}
            style={{ width: `${((outcomes?.[key] || 0) / total) * 100}%`, backgroundColor: color }}
          />
        ))}
      </div>
      <div className="mt-6 space-y-4">
        {rows.map(([key, label, color, description]) => (
          <div className="flex items-center gap-3 text-sm" key={key}>
            <span className="h-3 w-3 rounded bg-current" style={{ color }} />
            <span className="font-semibold text-[#26353D]">{label}</span>
            <span className="text-[#71808A]">· {description}</span>
            <span className="ml-auto font-mono text-[#26353D]">{outcomes?.[key] || 0}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 rounded-xl bg-[#F6F3EC] px-4 py-3 text-sm text-[#71808A]">
        Uncertain results are never counted as “No mismatch”. They wait for a person.
      </p>
    </div>
  )
}

function AttentionList({ items, navigate }) {
  return (
    <div className="mt-5 divide-y divide-[#E9E5D9]">
      {items?.length ? (
        items.slice(0, 6).map((item) => (
          <button
            key={item.email_id}
            className="flex w-full items-center gap-4 py-4 text-left hover:bg-[#FCFAF4]"
            onClick={() =>
              navigate(
                item.status === STATUS.NEEDS_REVIEW
                  ? `/review/${item.email_id}`
                  : `/inbox/${item.email_id}`,
              )
            }
          >
            <span className="w-20 shrink-0 font-mono text-sm text-[#71808A]">
              {item.display_id}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm text-[#26353D]">{item.subject}</strong>
              <span className="block truncate text-sm text-[#71808A]">
                {item.attention || 'Needs attention'}
              </span>
            </span>
            <span className="hidden rounded-full bg-[#FBEBCF] px-3 py-1 font-mono text-xs text-[#8A5300] sm:block">
              {item.review_reason || 'needs_review'}
            </span>
            <ArrowRight size={18} className="text-[#71808A]" />
          </button>
        ))
      ) : (
        <p className="py-8 text-sm text-[#71808A]">No cases need attention.</p>
      )}
    </div>
  )
}

function MismatchesByField({ defects, navigate }) {
  const [open, setOpen] = useState(false)
  const total = defectTotal(defects)
  const fieldCount = Object.values(defects || {}).filter(Boolean).length

  return (
    <div className="mt-6 border-t border-[#E9E5D9] pt-5">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[#FCFAF4]"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mismatches-by-field"
      >
        <ChartBar size={18} className="shrink-0 text-[#0E5A66]" />
        <span className="min-w-0 flex-1">
          <strong className="block text-sm font-semibold text-[#26353D]">
            Mismatches by field
          </strong>
          <span className="block text-sm text-[#71808A]">
            {total} defects across {fieldCount} fields · where mismatches happen most
          </span>
        </span>
        <CaretDown
          size={18}
          className={cn('shrink-0 text-[#71808A] transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div id="mismatches-by-field">
          <DefectsByField defects={defects} className="mt-5" />
          <button
            type="button"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#0E5A66] hover:underline"
            onClick={() => navigate('/review')}
          >
            Open these in the review queue
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

export function DashboardPage({ navigate, initialRunId = null }) {
  const [data, setData] = useState(null)
  const [lastRunAt, setLastRunAt] = useState(null)
  const [runId, setRunId] = useState(initialRunId)
  const [running, setRunning] = useState(false)

  async function loadDashboard() {
    const summary = await getDashboard()
    setData(summary)

    // The summary endpoint only carries the run id, so the finish time comes
    // from the run record itself.
    if (summary.last_run_at) {
      setLastRunAt(summary.last_run_at)
    } else if (summary.latest_run_id) {
      const run = await getPipelineRun(summary.latest_run_id).catch(() => null)
      setLastRunAt(run?.finished_at || run?.started_at || null)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  async function startPipeline() {
    setRunning(true)
    const run = await runPipeline()
    setRunId(run.run_id)
    setRunning(false)
    loadDashboard()
  }

  if (!data)
    return (
      <div className="p-8 lg:p-12">
        <div className="h-8 w-56 animate-pulse rounded bg-[#E9E5D9]" />
        <div className="mt-8 h-80 animate-pulse rounded-2xl bg-white" />
      </div>
    )

  return (
    <>
      <div className="mx-auto max-w-[1540px] px-5 py-10 lg:px-14">
        <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-[#62757D]">Saturday, 19 September 2026</p>
            <h1 className="mt-1 font-serif text-5xl font-semibold tracking-tight text-[#16232B]">
              Overview
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={submissionUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center gap-3 rounded-xl border border-[#D5D0C2] bg-white px-5 text-sm font-semibold text-[#26353D] hover:bg-[#FCFAF4]"
            >
              <ArrowDown size={19} />
              Export submission JSON
            </a>
            <button
              className="inline-flex h-12 items-center gap-3 rounded-xl bg-[#0E5A66] px-5 text-sm font-semibold text-white hover:bg-[#0B4B55] disabled:opacity-60"
              onClick={startPipeline}
              disabled={running}
            >
              <Play size={18} weight="fill" />
              {running ? 'Running pipeline…' : 'Run pipeline'}
            </button>
          </div>
        </header>

        <div className="mt-10">
          <SummaryBrief data={data} navigate={navigate} lastRunAt={lastRunAt} />
        </div>

        <SectionCard
          className="mt-7"
          title="Needs your attention"
          subtitle="Escalated with the reason and source evidence"
        >
          <AttentionList items={data.attention} navigate={navigate} />
          <MismatchesByField defects={data.defects_by_field} navigate={navigate} />
        </SectionCard>

        <section className="mt-7 grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Inbox by category"
            subtitle="Every email is classified. Only comparison requests continue to checking."
          >
            <CategoryPie categories={data.categories} />
          </SectionCard>
          <SectionCard
            title="Comparison outcomes"
            subtitle={`Of ${data.comparison_requests} comparison requests`}
          >
            <OutcomeBreakdown outcomes={data.outcomes} />
          </SectionCard>
        </section>

        {runId && <PipelineRunDrawer runId={runId} onClose={() => setRunId(null)} />}
      </div>
      {running && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#16232B] px-5 py-3 text-sm font-semibold text-white shadow-xl">
          <WarningCircle size={18} />
          Processing the fixture inbox…
        </div>
      )}
    </>
  )
}
