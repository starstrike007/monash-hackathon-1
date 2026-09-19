import { useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, Play, WarningCircle } from '@phosphor-icons/react'

import { PipelineRunDrawer } from '@/features/pipeline-run/PipelineRunDrawer'
import { getDashboard, getEmail, getEmails, runPipeline, submissionUrl } from '@/lib/api'
import { CATEGORY_LABELS, FIELDS, STATUS } from '@/lib/types'
import { cn } from '@/lib/utils'

function SummaryCard({ label, value, caption, warning = false, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'relative rounded-2xl bg-white p-6 text-left shadow-[0_2px_10px_rgba(22,35,43,0.05)]',
        'transition-all duration-200 ease-out hover:z-10 hover:scale-[1.03] hover:shadow-[0_12px_32px_rgba(22,35,43,0.12)] motion-reduce:transition-none motion-reduce:hover:scale-100',
        warning && 'bg-[#FBEBCF]',
        onClick &&
          'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E5A66]',
      )}
    >
      <p className={cn('text-sm font-medium text-[#687780]', warning && 'text-[#8A5300]')}>
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-mono text-5xl font-semibold tracking-tight text-[#16232B]',
          warning && 'text-[#8A5300]',
        )}
      >
        {value}
      </p>
      <p className={cn('mt-3 text-sm text-[#687780]', warning && 'font-medium text-[#8A5300]')}>
        {caption}
      </p>
    </Tag>
  )
}

function formatLastUpdated(timestamp, now) {
  const minutes = Math.floor((now - timestamp) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 min ago'
  if (minutes < 60) return `${minutes} mins ago`
  const hours = Math.floor(minutes / 60)
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}

function SectionCard({ title, subtitle, children, className }) {
  return (
    <section
      className={cn('rounded-2xl bg-white p-7 shadow-[0_2px_10px_rgba(22,35,43,0.05)]', className)}
    >
      <h2 className="text-xl font-semibold tracking-tight text-[#16232B]">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-[#71808A]">{subtitle}</p>}
      {children}
    </section>
  )
}

function CategoryBreakdown({ categories }) {
  const entries = Object.entries(categories || {})
  const maximum = Math.max(...entries.map(([, value]) => value), 1)
  return (
    <div className="mt-6 space-y-5">
      {entries.map(([category, value]) => (
        <div key={category} className="group">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-[#46555E] transition-colors group-hover:text-[#16232B]">
              {CATEGORY_LABELS[category] || category}
            </span>
            <span className="font-mono text-[#46555E]">{value}</span>
          </div>
          <div className="mt-2 flex h-4 items-center rounded-full bg-[#E9E5D9]">
            <div
              className="h-3 rounded-full bg-[#91ADB2] transition-all duration-200 ease-out group-hover:h-4 group-hover:bg-[#0E5A66] motion-reduce:transition-none"
              style={{ width: `${(value / maximum) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
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
        items.slice(0, 4).map((item) => (
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

function DefectsByField({ defects, onSelect }) {
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
  const [runId, setRunId] = useState(initialRunId)
  const [running, setRunning] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(Date.now)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    getDashboard().then((value) => {
      setData(value)
      setLastUpdated(Date.now())
    })
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  async function startPipeline() {
    setRunning(true)
    const run = await runPipeline()
    setRunId(run.run_id)
    setRunning(false)
    getDashboard().then((value) => {
      setData(value)
      setLastUpdated(Date.now())
      setNow(Date.now())
    })
  }

  async function openFirst(filter, fallback) {
    const { items } = await getEmails(filter.params)
    const first = items.find(filter.match)
    navigate(first ? `/inbox/${first.email_id}` : fallback)
  }

  async function openDefect(fieldKey) {
    const { items } = await getEmails({ status: 'mismatch' })
    const mismatches = items.filter((item) => item.status === STATUS.MISMATCH).slice(0, 25)
    const details = await Promise.all(mismatches.map((item) => getEmail(item.email_id)))
    const index = details.findIndex((detail) =>
      detail?.result?.comparisons?.some(
        (comparison) => comparison.field_name === fieldKey && comparison.result === 'mismatch',
      ),
    )
    const target = mismatches[index] || mismatches[0]
    navigate(target ? `/inbox/${target.email_id}` : '/inbox?status=mismatch')
  }

  if (!data)
    return (
      <div className="p-8 lg:p-12">
        <div className="h-8 w-56 animate-pulse rounded bg-[#E9E5D9]" />
        <div className="mt-8 grid gap-4 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div className="h-36 animate-pulse rounded-2xl bg-white" key={item} />
          ))}
        </div>
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

        <section className="mt-10 grid gap-4 xl:grid-cols-4">
          <SummaryCard
            label="Emails processed"
            value={data.emails_processed}
            caption={`Last updated: ${formatLastUpdated(lastUpdated, now)}`}
          />
          <SummaryCard
            label="Comparison requests"
            value={data.comparison_requests}
            caption={`${data.comparison_requests - 2} SI/BL pairs · 2 missing attachment`}
            onClick={() =>
              openFirst(
                { params: {}, match: (item) => item.category === 'BL_COMPARISON' },
                '/inbox',
              )
            }
          />
          <SummaryCard
            label="Mismatches found"
            value={data.mismatches_found}
            caption={`Across ${data.comparison_requests - data.needs_review} fully compared pairs`}
            onClick={() =>
              openFirst(
                {
                  params: { status: 'mismatch' },
                  match: (item) => item.status === STATUS.MISMATCH,
                },
                '/inbox?status=mismatch',
              )
            }
          />
          <SummaryCard
            label="Needs review"
            value={data.needs_review}
            caption="Awaiting a person's decision"
            warning
            onClick={() => navigate('/review')}
          />
        </section>

        <section className="mt-7 grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Inbox by category"
            subtitle="Every email is classified. Only comparison requests continue to checking."
          >
            <CategoryBreakdown categories={data.categories} />
          </SectionCard>
          <SectionCard
            title="Comparison outcomes"
            subtitle={`Of ${data.comparison_requests} comparison requests`}
          >
            <OutcomeBreakdown outcomes={data.outcomes} />
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
            <DefectsByField defects={data.defects_by_field} onSelect={openDefect} />
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
