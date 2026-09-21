import { useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, Clock, Play, WarningCircle } from '@phosphor-icons/react'

import { CategoryPie } from '@/components/charts/CategoryPie'
import { BackendError } from '@/components/BackendError'
import { PipelineRunDrawer } from '@/features/pipeline-run/PipelineRunDrawer'
import {
  getDashboard,
  getEmail,
  getEmails,
  getPipelineRun,
  notifyDataChanged,
  runPipeline,
  submissionUrl,
} from '@/lib/api'
import { formatBusinessDay, relativeTime } from '@/lib/time'
import { FIELDS, STATUS } from '@/lib/types'
import { cn } from '@/lib/utils'

function SummaryCard({ label, value, caption, warning = false, compact = false, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'relative rounded-2xl bg-white text-left shadow-[0_2px_10px_rgba(22,35,43,0.05)]',
        compact ? 'p-5' : 'p-6',
        warning && 'bg-[#FBEBCF]',
        onClick
          ? 'group cursor-pointer transition-all duration-200 ease-out hover:z-10 hover:scale-[1.03] hover:shadow-[0_12px_32px_rgba(22,35,43,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E5A66] motion-reduce:transition-none motion-reduce:hover:scale-100'
          : 'cursor-default',
      )}
    >
      {onClick && (
        <ArrowRight
          size={16}
          weight="bold"
          aria-hidden="true"
          className={cn(
            'absolute right-4 top-4 transition-transform duration-200 group-hover:translate-x-0.5',
            warning ? 'text-[#8A5300]' : 'text-[#0E5A66]',
          )}
        />
      )}
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
    </Tag>
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

function SummaryBrief({ data, navigate, lastRunAt, onOpenComparisons, onOpenMismatches }) {
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
              caption={`${(data.outcomes?.OK || 0) + (data.outcomes?.MISMATCH || 0)} fully compared`}
              onClick={onOpenComparisons}
            />
            <SummaryCard
              compact
              label="Mismatches found"
              value={data.mismatches_found}
              caption={`Across ${data.outcomes?.MISMATCH || 0} compared pairs`}
              onClick={onOpenMismatches}
            />
            <SummaryCard
              compact
              label="Needs review"
              value={data.needs_review}
              caption="Open review queue →"
              warning
              onClick={() => navigate('/review')}
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

function SectionCard({ id, title, subtitle, children, className }) {
  return (
    <section
      id={id}
      className={cn('rounded-2xl bg-white p-7 shadow-[0_2px_10px_rgba(22,35,43,0.05)]', className)}
    >
      <h2 className="text-xl font-semibold tracking-tight text-[#16232B]">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-[#71808A]">{subtitle}</p>}
      {children}
    </section>
  )
}

const OUTCOME_INBOX_FILTER = {
  OK: 'no_mismatch',
  MISMATCH: 'mismatch',
  NEEDS_REVIEW: 'needs_review',
}

function OutcomeBreakdown({ outcomes, navigate }) {
  const [activeKey, setActiveKey] = useState(null)
  const rows = [
    ['OK', 'No mismatch', '#2B965C', 'all 7 fields agree'],
    ['MISMATCH', 'Mismatch', '#CF3B32', 'at least one field differs'],
    ['NEEDS_REVIEW', 'Needs review', '#C47A00', 'a person decides'],
  ]
  const total = rows.reduce((sum, [key]) => sum + (outcomes?.[key] || 0), 0) || 1
  const openComparisons = (key) => navigate(`/docs-comparison?status=${OUTCOME_INBOX_FILTER[key]}`)
  const dimmed = (key) => activeKey !== null && activeKey !== key
  const highlight = (key) => ({
    onMouseEnter: () => setActiveKey(key),
    onMouseLeave: () => setActiveKey(null),
    onFocus: () => setActiveKey(key),
    onBlur: () => setActiveKey(null),
  })
  return (
    <div className="mt-6">
      <div className="mt-2 flex h-8 gap-0.5">
        {rows.map(([key, label, color], index) => {
          const value = outcomes?.[key] || 0
          const percent = Math.round((value / total) * 100)
          const active = activeKey === key
          const edge =
            index === 0
              ? 'left-0'
              : index === rows.length - 1
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2'
          return (
            <div
              key={key}
              className="relative h-full"
              style={{ width: `${(value / total) * 100}%` }}
              {...highlight(key)}
            >
              <button
                type="button"
                onClick={() => openComparisons(key)}
                aria-label={`${label}: ${value} of ${total} (${percent}%). Open in Docs Comparison`}
                className={cn(
                  'block h-full w-full cursor-pointer outline-none',
                  index === 0 && 'rounded-l-lg',
                  index === rows.length - 1 && 'rounded-r-lg',
                  'origin-center transition-all duration-200 ease-out motion-reduce:transition-none',
                  active && 'scale-y-125 shadow-lg',
                  dimmed(key) && 'opacity-40',
                )}
                style={{ backgroundColor: color }}
              />
              <span
                role="tooltip"
                className={cn(
                  'pointer-events-none absolute -top-11 z-20 whitespace-nowrap rounded-lg bg-[#16232B] px-3 py-2 text-xs font-semibold leading-none text-white shadow-lg transition-all duration-200 motion-reduce:transition-none',
                  edge,
                  active ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
                )}
              >
                {label}
                <span className="ml-2 font-mono font-medium text-white/70">
                  {value} · {percent}%
                </span>
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-6 space-y-1">
        {rows.map(([key, label, color, description]) => {
          const active = activeKey === key
          return (
            <button
              type="button"
              onClick={() => openComparisons(key)}
              className={cn(
                'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-all duration-200 ease-out motion-reduce:transition-none',
                active && 'scale-[1.02] shadow-sm',
                dimmed(key) && 'opacity-40',
              )}
              style={active ? { backgroundColor: `${color}1A` } : undefined}
              key={key}
              {...highlight(key)}
            >
              <span
                className={cn(
                  'h-3 w-3 rounded bg-current transition-transform duration-200',
                  active && 'scale-125',
                )}
                style={{ color }}
              />
              <span className="font-semibold text-[#26353D]">{label}</span>
              <span className={cn('text-[#71808A]', active && 'font-medium text-[#26353D]')}>
                · {description}
              </span>
              <span className="ml-auto font-mono text-[#26353D]">{outcomes?.[key] || 0}</span>
            </button>
          )
        })}
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
              // Every attention item is a NEEDS_REVIEW comparison; Docs
              // Comparison shows the state-aware banner with a link into
              // the review queue item (which has its own id, not email_id).
              navigate(`/docs-comparison/${item.email_id}`)
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

function DefectsByFieldSelectable({ defects, onSelect }) {
  const rows = FIELDS.map((field) => ({ ...field, value: defects?.[field.key] || 0 })).sort(
    (a, b) => b.value - a.value,
  )
  const maximum = Math.max(...rows.map((row) => row.value), 1)
  return (
    <div className="mt-6 space-y-1">
      {rows.map((row) => (
        <button
          type="button"
          key={row.key}
          onClick={() => onSelect(row.key)}
          aria-label={`${row.label}: ${row.value} defects. Open a case with this defect`}
          className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-[#FCFAF4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E5A66]"
        >
          <span className="w-32 shrink-0 text-[#46555E]">{row.label}</span>
          <div className="flex h-3 flex-1 items-center rounded-full bg-[#E9E5D9]">
            <div
              className="h-2 rounded-full bg-[#CF3B32] transition-all duration-200 ease-out group-hover:h-3 group-hover:bg-[#B02A22] motion-reduce:transition-none"
              style={{ width: `${(row.value / maximum) * 100}%` }}
            />
          </div>
          <span className="w-7 text-right font-mono text-[#46555E]">{row.value}</span>
        </button>
      ))}
    </div>
  )
}

export function DashboardPage({ navigate, initialRunId = null }) {
  const [data, setData] = useState(null)
  const [lastRunAt, setLastRunAt] = useState(null)
  const [runId, setRunId] = useState(initialRunId)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  async function loadDashboard() {
    setError(null)
    try {
      const summary = await getDashboard()
      setData(summary)

      // The summary endpoint only carries the run id, so the finish time comes
      // from the run record itself.
      if (summary.last_run_at) {
        setLastRunAt(summary.last_run_at)
      } else if (summary.latest_run_id) {
        const run = await getPipelineRun(summary.latest_run_id)
        setLastRunAt(run?.finished_at || run?.started_at || null)
      }
    } catch (reason) {
      setError(reason)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  useEffect(() => {
    if (!data || window.location.hash !== '#comparison-outcomes') return
    window.requestAnimationFrame(() =>
      document.getElementById('comparison-outcomes')?.scrollIntoView({ block: 'center' }),
    )
  }, [data])

  async function startPipeline() {
    setRunning(true)
    setError(null)
    try {
      const run = await runPipeline()
      setRunId(run.run_id)
      notifyDataChanged()
      await loadDashboard()
    } catch (reason) {
      setError(reason)
    } finally {
      setRunning(false)
    }
  }

  async function openFirst(filter, fallback) {
    try {
      const { items } = await getEmails(filter.params)
      const first = items.find(filter.match)
      navigate(first ? `/docs-comparison/${first.email_id}` : fallback)
    } catch (reason) {
      setError(reason)
    }
  }

  async function openDefect(fieldKey) {
    try {
      const { items } = await getEmails({ status: 'mismatch' })
      const mismatches = items.filter((item) => item.status === STATUS.MISMATCH).slice(0, 25)
      const details = await Promise.all(mismatches.map((item) => getEmail(item.email_id)))
      const index = details.findIndex((detail) =>
        detail?.result?.comparisons?.some(
          (comparison) => comparison.field_name === fieldKey && comparison.result === 'mismatch',
        ),
      )
      const target = mismatches[index] || mismatches[0]
      navigate(target ? `/docs-comparison/${target.email_id}` : '/docs-comparison?status=mismatch')
    } catch (reason) {
      setError(reason)
    }
  }

  if (error && !data)
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10 lg:px-14">
        <BackendError error={error} onRetry={loadDashboard} />
      </div>
    )

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
            <p className="text-sm font-medium text-[#62757D]">{formatBusinessDay()}</p>
            <h1 className="mt-1 font-serif text-5xl font-semibold tracking-tight text-[#16232B]">
              Overview
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={submissionUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold leading-none transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100 bg-white text-[#26353D] shadow-sm"
            >
              <ArrowDown size={16} className="shrink-0" />
              Export submission JSON
            </a>
            <button
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold leading-none transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100 bg-[#0E5A66] text-white hover:bg-[#0B4B55] disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none"
              onClick={startPipeline}
              disabled={running}
            >
              <Play size={16} weight="fill" className="shrink-0" />
              {running ? 'Running pipeline…' : 'Run pipeline'}
            </button>
          </div>
        </header>

        {error && (
          <div className="mt-6">
            <BackendError error={error} onRetry={loadDashboard} compact />
          </div>
        )}

        <div className="mt-10">
          <SummaryBrief
            data={data}
            navigate={navigate}
            lastRunAt={lastRunAt}
            onOpenComparisons={() =>
              openFirst(
                { params: {}, match: (item) => item.category === 'BL_COMPARISON' },
                '/docs-comparison',
              )
            }
            onOpenMismatches={() =>
              openFirst(
                {
                  params: { status: 'mismatch' },
                  match: (item) => item.status === STATUS.MISMATCH,
                },
                '/docs-comparison?status=mismatch',
              )
            }
          />
        </div>

        <section className="mt-7 grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Inbox by category"
            subtitle="Every email is classified. Only comparison requests continue to checking."
          >
            <CategoryPie categories={data.categories} />
          </SectionCard>
          <SectionCard
            id="comparison-outcomes"
            title="Comparison outcomes"
            subtitle={`Of ${data.comparison_requests} comparison requests`}
          >
            <OutcomeBreakdown outcomes={data.outcomes} navigate={navigate} />
          </SectionCard>
        </section>

        <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
          <SectionCard
            title="Needs your attention"
            subtitle="Escalated with the reason and source evidence"
          >
            <AttentionList items={data.attention} navigate={navigate} />
          </SectionCard>
          <SectionCard title="Defects by field" subtitle="Where mismatches happen most">
            <DefectsByFieldSelectable defects={data.defects_by_field} onSelect={openDefect} />
          </SectionCard>
        </section>

        {runId && <PipelineRunDrawer runId={runId} onClose={() => setRunId(null)} />}
      </div>
      {running && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#16232B] px-5 py-3 text-sm font-semibold text-white shadow-xl">
          <WarningCircle size={18} />
          Processing the inbox…
        </div>
      )}
    </>
  )
}
