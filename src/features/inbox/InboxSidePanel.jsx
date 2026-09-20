import { DefectsByField, defectTotal } from '@/components/charts/DefectsByField'
import { CATEGORY_LABELS } from '@/lib/types'

const OUTCOMES = [
  { key: 'OK', label: 'No mismatch', color: '#2B965C' },
  { key: 'MISMATCH', label: 'Mismatch', color: '#CF3B32' },
  { key: 'NEEDS_REVIEW', label: 'Needs review', color: '#C47A00' },
]

const REVIEW_REASONS = {
  missing_attachment: 'Missing attachment',
  unreadable: 'Unreadable document',
  missing_value: 'Missing value',
  wrong_doc_type: 'Wrong document type',
}

function PanelShell({ title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-[#E3DED1] bg-white p-6 xl:sticky xl:top-6">
      <h2 className="text-lg font-semibold tracking-tight text-[#16232B]">{title}</h2>
      <p className="mt-1 text-sm text-[#71808A]">{subtitle}</p>
      {children}
    </section>
  )
}

function Note({ children }) {
  return <p className="mt-6 rounded-xl bg-[#F6F3EC] px-4 py-3 text-sm text-[#71808A]">{children}</p>
}

function BarRow({ label, value, maximum, color }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-[#46555E]">{label}</span>
        <span className="font-mono text-[#46555E]">{value}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-[#E9E5D9]">
        <div
          className="h-2 rounded-full"
          style={{ width: `${(value / Math.max(maximum, 1)) * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function OutcomeSplit({ outcomes }) {
  const total = OUTCOMES.reduce((sum, item) => sum + (outcomes?.[item.key] || 0), 0) || 1
  return (
    <>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {OUTCOMES.map((item) => (
          <div
            key={item.key}
            style={{
              width: `${((outcomes?.[item.key] || 0) / total) * 100}%`,
              backgroundColor: item.color,
            }}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {OUTCOMES.map((item) => (
          <li className="flex items-center gap-2 text-sm" key={item.key}>
            <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: item.color }} />
            <span className="text-[#46555E]">{item.label}</span>
            <span className="ml-auto font-mono text-[#26353D]">{outcomes?.[item.key] || 0}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function AllPanel({ summary }) {
  const categories = Object.entries(summary?.categories || {}).sort((a, b) => b[1] - a[1])
  const maximum = categories[0]?.[1] || 1
  return (
    <PanelShell
      title="Inbox at a glance"
      subtitle={`${summary?.emails_processed ?? 0} emails, ${summary?.comparison_requests ?? 0} of them SI/BL comparison requests.`}
    >
      <div className="mt-6">
        <OutcomeSplit outcomes={summary?.outcomes} />
      </div>
      <h3 className="mt-6 text-sm font-semibold text-[#26353D]">By category</h3>
      <div className="mt-3 space-y-3">
        {categories.map(([category, value]) => (
          <BarRow
            key={category}
            label={CATEGORY_LABELS[category] || category}
            value={value}
            maximum={maximum}
            color="#0E5A66"
          />
        ))}
      </div>
    </PanelShell>
  )
}

function NeedsReviewPanel({ items }) {
  const reasons = Object.entries(
    items.reduce((counts, item) => {
      const reason = item.review_reason || 'other'
      counts[reason] = (counts[reason] || 0) + 1
      return counts
    }, {}),
  ).sort((a, b) => b[1] - a[1])
  const maximum = reasons[0]?.[1] || 1
  return (
    <PanelShell
      title="Why these need review"
      subtitle={`${items.length} ${items.length === 1 ? 'case is' : 'cases are'} waiting for a person to decide.`}
    >
      <div className="mt-6 space-y-4">
        {reasons.length ? (
          reasons.map(([reason, value]) => (
            <BarRow
              key={reason}
              label={REVIEW_REASONS[reason] || 'Other'}
              value={value}
              maximum={maximum}
              color="#C47A00"
            />
          ))
        ) : (
          <p className="text-sm text-[#71808A]">Nothing is waiting for review.</p>
        )}
      </div>
      <Note>Uncertain results are never counted as “No mismatch”. They wait for a person.</Note>
    </PanelShell>
  )
}

function MismatchPanel({ summary }) {
  return (
    <PanelShell
      title="Defects by field"
      subtitle={`${defectTotal(summary?.defects_by_field)} mismatches across the seven checked fields — where drafts go wrong most.`}
    >
      <DefectsByField defects={summary?.defects_by_field} className="mt-6" />
      <Note>
        Counted from mismatched pairs. Cases in the review queue are escalated for unreadable or
        missing documents and are not counted here.
      </Note>
    </PanelShell>
  )
}

function CleanPanel({ summary }) {
  const clean = summary?.outcomes?.OK ?? 0
  const compared = summary?.comparison_requests || 0
  const share = compared ? Math.round((clean / compared) * 100) : 0
  return (
    <PanelShell
      title="Clean comparisons"
      subtitle="Draft BLs where every checked field agrees with the shipping instruction."
    >
      <p className="mt-6 font-mono text-5xl font-semibold tracking-tight text-[#17693F]">{clean}</p>
      <p className="mt-2 text-sm text-[#46555E]">
        {share}% of {compared} comparison requests
      </p>
      <div className="mt-6">
        <OutcomeSplit outcomes={summary?.outcomes} />
      </div>
      <Note>
        All 7 fields — shipper, consignee, notify party, ports, containers and weight — agree.
      </Note>
    </PanelShell>
  )
}

export function InboxSidePanel({ filter, summary, items }) {
  if (filter === 'needs_review') return <NeedsReviewPanel items={items} />
  if (filter === 'mismatch') return <MismatchPanel summary={summary} />
  if (filter === 'no_mismatch') return <CleanPanel summary={summary} />
  return <AllPanel summary={summary} />
}
