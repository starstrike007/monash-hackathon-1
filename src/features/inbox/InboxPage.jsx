import { useEffect, useState } from 'react'
import { ArrowRight, MagnifyingGlass } from '@phosphor-icons/react'

import { DefectsByField, defectTotal } from '@/components/charts/DefectsByField'
import { CategoryBadge, StatusBadge } from '@/components/layout/StatusBadge'
import { getAllEmails, getDashboard } from '@/lib/api'
import { categoryLabel } from '@/lib/types'

const filters = [
  { key: '', label: 'All' },
  { key: 'needs_review', label: 'Needs review' },
  { key: 'mismatch', label: 'Mismatch' },
  { key: 'no_mismatch', label: 'No mismatch' },
]

function FilterButton({ filter, active, count, onClick }) {
  return (
    <button
      className={`rounded-full border px-6 py-3 text-sm font-semibold transition-colors ${active ? 'border-[#16232B] bg-[#16232B] text-white' : 'border-[#D5D0C2] bg-white text-[#46555E] hover:bg-[#FCFAF4]'}`}
      onClick={onClick}
    >
      {filter.label}
      <span
        className={`ml-3 rounded-full px-2 py-0.5 text-xs ${active ? 'bg-[#294A5C] text-white' : 'bg-[#E9E5D9] text-[#46555E]'}`}
      >
        {count}
      </span>
    </button>
  )
}

export function InboxPage({ navigate, initialStatus = '' }) {
  const isReviewQueue = initialStatus === 'needs_review'
  const [activeFilter, setActiveFilter] = useState(initialStatus || '')
  const [query, setQuery] = useState('')
  const [data, setData] = useState({ items: [], total: 0 })
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getAllEmails({ status: activeFilter, query }).then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [activeFilter, query])

  useEffect(() => {
    getDashboard().then(setSummary)
  }, [])

  const counts = {
    '': summary?.emails_processed ?? 0,
    needs_review: summary?.needs_review ?? 0,
    mismatch: summary?.mismatches_found ?? 0,
    no_mismatch: summary?.outcomes?.OK ?? 0,
  }

  return (
    <div className="mx-auto max-w-[1540px] px-5 py-10 lg:px-14">
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#62757D]">
            {summary?.emails_processed ?? 0} emails · last run complete
          </p>
          <h1 className="mt-1 font-serif text-5xl font-semibold tracking-tight text-[#16232B]">
            {isReviewQueue ? 'Review queue' : 'Inbox'}
          </h1>
        </div>
        <label className="flex h-14 w-full items-center gap-3 rounded-xl border border-[#D5D0C2] bg-white px-5 text-[#71808A] sm:max-w-[420px]">
          <MagnifyingGlass size={20} />
          <span className="sr-only">Search inbox</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-[#16232B] outline-none placeholder:text-[#8A969B]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search subject, sender or ID"
          />
        </label>
      </header>

      <div className="mt-9 flex flex-wrap gap-3">
        {filters.map((filter) => (
          <FilterButton
            key={filter.key}
            filter={filter}
            count={counts[filter.key]}
            active={activeFilter === filter.key}
            onClick={() => setActiveFilter(filter.key)}
          />
        ))}
      </div>

      <div
        className={
          isReviewQueue
            ? 'mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.32fr)] xl:items-start'
            : 'mt-6'
        }
      >
        <div className="overflow-hidden rounded-2xl border border-[#E3DED1] bg-white">
          <div className="hidden grid-cols-[120px_minmax(260px,1.8fr)_190px_170px_minmax(220px,1fr)_32px] gap-4 bg-[#FBF9F4] px-6 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#71808A] lg:grid">
            <span>Email</span>
            <span>Subject</span>
            <span>Category</span>
            <span>Status</span>
            <span>What needs attention</span>
            <span />
          </div>
          {loading && (
            <div className="px-6 py-14 text-center text-sm text-[#71808A]">Loading emails…</div>
          )}
          {!loading &&
            data.items.map((item) => (
              <button
                key={item.email_id}
                onClick={() =>
                  navigate(
                    item.status === 'NEEDS_REVIEW'
                      ? `/review/${item.email_id}`
                      : `/inbox/${item.email_id}`,
                  )
                }
                className="grid w-full grid-cols-1 gap-3 border-t border-[#E9E5D9] px-6 py-5 text-left transition-colors hover:bg-[#FCFAF4] lg:grid-cols-[120px_minmax(260px,1.8fr)_190px_170px_minmax(220px,1fr)_32px] lg:items-center lg:gap-4"
              >
                <span className="font-mono text-sm text-[#71808A]">{item.display_id}</span>
                <span className="min-w-0">
                  <strong className="block truncate text-[15px] text-[#26353D]">
                    {item.subject}
                  </strong>
                  <span className="mt-1 block truncate text-sm text-[#71808A]">
                    {item.sender} ·{' '}
                    {item.attachments?.length
                      ? `${item.attachments.length} attachments`
                      : 'no attachments'}
                  </span>
                </span>
                <CategoryBadge category={item.category} className="w-fit" />
                <span>
                  <StatusBadge status={item.status} />
                </span>
                <span className="truncate text-sm text-[#5E6D75]">
                  <span className="mr-2 rounded-full bg-[#FBEBCF] px-2 py-1 font-mono text-xs text-[#8A5300]">
                    {item.review_reason || ''}
                  </span>
                  {item.attention ||
                    (item.status ? categoryLabel(item.category) : 'Classified only')}
                </span>
                <ArrowRight size={18} className="hidden text-[#71808A] lg:block" />
              </button>
            ))}
          {!loading && !data.items.length && (
            <div className="px-6 py-14 text-center text-sm text-[#71808A]">
              No emails match this filter.
            </div>
          )}
        </div>

        {isReviewQueue && (
          <section className="rounded-2xl border border-[#E3DED1] bg-white p-6 xl:sticky xl:top-6">
            <h2 className="text-lg font-semibold tracking-tight text-[#16232B]">
              Defects by field
            </h2>
            <p className="mt-1 text-sm text-[#71808A]">
              {defectTotal(summary?.defects_by_field)} mismatches across the seven checked fields —
              where drafts go wrong most.
            </p>
            <DefectsByField defects={summary?.defects_by_field} className="mt-6" />
            <p className="mt-6 rounded-xl bg-[#F6F3EC] px-4 py-3 text-sm text-[#71808A]">
              Counted from mismatched pairs. Cases in this queue are escalated for unreadable or
              missing documents and are not counted here.
            </p>
          </section>
        )}
      </div>

      <p className="mt-5 text-sm text-[#71808A]">
        Showing {data.items.length} of {data.total} emails. Only document-comparison emails get a
        comparison status; every other category is classified and set aside.
      </p>
    </div>
  )
}
