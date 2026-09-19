import { useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, Play, WarningCircle } from '@phosphor-icons/react'

import { PipelineRunDrawer } from '@/features/pipeline-run/PipelineRunDrawer'
import { getDashboard, runPipeline, submissionUrl } from '@/lib/api'
import { CATEGORY_LABELS, FIELDS, STATUS } from '@/lib/types'
import { cn } from '@/lib/utils'

function SummaryCard({ label, value, caption, warning = false }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[#E3DED1] bg-white p-6 shadow-[0_1px_1px_rgba(22,35,43,0.03)]',
        warning && 'border-[#EBCB83] bg-[#FBEBCF]',
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
    </div>
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

function CategoryBreakdown({ categories }) {
  const entries = Object.entries(categories || {})
  const maximum = Math.max(...entries.map(([, value]) => value), 1)
  return (
    <div className="mt-6 space-y-5">
      {entries.map(([category, value], index) => (
        <div key={category}>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className={cn('font-medium', index === 0 ? 'text-[#16232B]' : 'text-[#46555E')}>
              {CATEGORY_LABELS[category] || category}
            </span>
            <span className="font-mono text-[#46555E]">{value}</span>
          </div>
          <div className="mt-2 h-3 rounded-full bg-[#E9E5D9]">
            <div
              className={cn('h-3 rounded-full', index === 0 ? 'bg-[#0E5A66]' : 'bg-[#91ADB2]')}
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

function DefectsByField({ defects }) {
  const rows = FIELDS.map((field) => ({ ...field, value: defects?.[field.key] || 0 })).sort(
    (a, b) => b.value - a.value,
  )
  const maximum = Math.max(...rows.map((row) => row.value), 1)
  return (
    <div className="mt-6 space-y-4">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 text-[#46555E]">{row.label}</span>
          <div className="h-2 flex-1 rounded-full bg-[#E9E5D9]">
            <div
              className="h-2 rounded-full bg-[#CF3B32]"
              style={{ width: `${(row.value / maximum) * 100}%` }}
            />
          </div>
          <span className="w-7 text-right font-mono text-[#46555E]">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

export function DashboardPage({ navigate }) {
  const [data, setData] = useState(null)
  const [runId, setRunId] = useState(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    getDashboard().then(setData)
  }, [])

  async function startPipeline() {
    setRunning(true)
    const run = await runPipeline()
    setRunId(run.run_id)
    setRunning(false)
    getDashboard().then(setData)
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

        <section className="mt-10 grid gap-4 xl:grid-cols-4">
          <SummaryCard
            label="Emails processed"
            value={data.emails_processed}
            caption={`${data.comparison_requests} with attachments`}
          />
          <SummaryCard
            label="Comparison requests"
            value={data.comparison_requests}
            caption={`${data.comparison_requests - 2} SI/BL pairs · 2 missing attachment`}
          />
          <SummaryCard
            label="Mismatches found"
            value={data.mismatches_found}
            caption={`Across ${data.comparison_requests - data.needs_review} fully compared pairs`}
          />
          <SummaryCard
            label="Needs review"
            value={data.needs_review}
            caption="Open review queue →"
            warning
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
            <DefectsByField defects={data.defects_by_field} />
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
