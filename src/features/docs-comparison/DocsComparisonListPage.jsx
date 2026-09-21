import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, MagnifyingGlass } from '@phosphor-icons/react'

import { StatusBadge } from '@/components/layout/StatusBadge'
import { BackendError } from '@/components/BackendError'
import { summarizeComparison } from '@/features/docs-comparison/summary'
import { getAllEmails } from '@/lib/api'
import { formatDate } from '@/lib/types'

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'mismatch', label: 'Mismatch' },
  { key: 'no_mismatch', label: 'No mismatch' },
  { key: 'needs_review', label: 'Needs review' },
]

export function DocsComparisonListPage({ navigate, initialStatus = '' }) {
  const [activeFilter, setActiveFilter] = useState(initialStatus || '')
  const [query, setQuery] = useState('')
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getAllEmails({ category: 'BL_COMPARISON', query })
      .then((result) => {
        setData(result)
        setLoading(false)
      })
      .catch((reason) => {
        setError(reason)
        setLoading(false)
      })
  }, [query, retryNonce])

  const visibleItems = useMemo(
    () =>
      data.items.filter(
        (item) =>
          !activeFilter ||
          (activeFilter === 'no_mismatch'
            ? item.status === 'OK'
            : item.status === activeFilter.toUpperCase()),
      ),
    [activeFilter, data.items],
  )

  const counts = useMemo(() => {
    const tally = { '': data.items.length, mismatch: 0, no_mismatch: 0, needs_review: 0 }
    for (const item of data.items) {
      if (item.status === 'MISMATCH') tally.mismatch += 1
      else if (item.status === 'OK') tally.no_mismatch += 1
      else if (item.status === 'NEEDS_REVIEW') tally.needs_review += 1
    }
    return tally
  }, [data.items])

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-14">
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#475569]">
            {visibleItems.length} comparison requests
          </p>
          <h1 className="mt-1 text-5xl font-semibold tracking-tight text-[#0F172A]">
            Docs Comparison
          </h1>
        </div>
        <label className="flex h-14 w-full items-center gap-3 rounded-xl border border-[#CBD5E1] bg-white px-5 text-[#64748B] sm:max-w-[420px]">
          <MagnifyingGlass size={20} />
          <span className="sr-only">Search comparisons</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search subject, sender or ID"
          />
        </label>
      </header>

      {error && (
        <div className="mt-7">
          <BackendError error={error} onRetry={() => setRetryNonce((value) => value + 1)} />
        </div>
      )}

      <div className="mt-9 flex flex-wrap gap-3">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setActiveFilter(filter.key)}
            aria-pressed={activeFilter === filter.key}
            className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold leading-none transition-colors ${
              activeFilter === filter.key
                ? 'bg-[#0F172A] text-white'
                : 'border border-slate-200 bg-white text-[#475569] hover:bg-[#F8FAFC]'
            }`}
          >
            {filter.label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${activeFilter === filter.key ? 'bg-[#334155] text-white' : 'bg-[#E2E8F0] text-[#475569]'}`}
            >
              {counts[filter.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
        <div className="hidden grid-cols-[120px_150px_minmax(240px,1.6fr)_170px_minmax(220px,1.4fr)_32px] gap-4 bg-[#F8FAFC] px-6 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B] lg:grid">
          <span>Email</span>
          <span>Received</span>
          <span>Subject</span>
          <span>Status</span>
          <span>Summary</span>
          <span />
        </div>
        {loading && <div className="px-6 py-14 text-center text-sm text-[#64748B]">Loading…</div>}
        {!loading &&
          !error &&
          visibleItems.map((item) => {
            const summary = summarizeComparison(item)
            return (
              <button
                key={item.email_id}
                onClick={() => navigate(`/docs-comparison/${item.email_id}`)}
                className="grid w-full grid-cols-1 gap-3 border-t border-[#E2E8F0] px-6 py-5 text-left transition-colors hover:bg-[#F8FAFC] lg:grid-cols-[120px_150px_minmax(240px,1.6fr)_170px_minmax(220px,1.4fr)_32px] lg:items-center lg:gap-4"
              >
                <span className="font-mono text-sm text-[#64748B]">{item.display_id}</span>
                <span className="text-sm text-[#64748B]">{formatDate(item.received_at)}</span>
                <strong className="min-w-0 truncate text-[15px] text-[#1E293B]">
                  {item.subject}
                </strong>
                <span>
                  <StatusBadge status={item.status} />
                </span>
                <span
                  className={`truncate text-sm ${summary.tone === 'mismatch' ? 'text-[#B91C1C]' : summary.tone === 'review' ? 'text-[#B45309]' : 'text-[#64748B]'}`}
                >
                  {summary.text}
                </span>
                <ArrowRight size={18} className="hidden text-[#64748B] lg:block" />
              </button>
            )
          })}
        {!loading && !error && !visibleItems.length && (
          <div className="px-6 py-14 text-center text-sm text-[#64748B]">
            No document-comparison emails match this filter.
          </div>
        )}
      </div>
    </div>
  )
}
