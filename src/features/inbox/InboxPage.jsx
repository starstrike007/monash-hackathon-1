import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
} from '@phosphor-icons/react'

import { CategoryBadge, StatusBadge } from '@/components/layout/StatusBadge'
import { CategoryFilter } from '@/features/inbox/CategoryFilter'
import { InboxSidePanel } from '@/features/inbox/InboxSidePanel'
import { getAllEmails, getDashboard } from '@/lib/api'
import { CATEGORY_LABELS, categoryLabel } from '@/lib/types'

const filters = [
  {
    key: '',
    label: 'All',
    idle: 'bg-white text-[#46555E] shadow-sm',
    idleCount: 'bg-[#E9E5D9] text-[#46555E]',
    selected: 'bg-[#16232B] text-white',
    selectedCount: 'bg-[#294A5C] text-white',
  },
  {
    key: 'needs_review',
    label: 'Needs review',
    idle: 'bg-[#FBEBCF] text-[#8A5300]',
    idleCount: 'bg-white/70 text-[#8A5300]',
    selected: 'bg-[#C47A00] text-white',
    selectedCount: 'bg-white/25 text-white',
  },
  {
    key: 'mismatch',
    label: 'Mismatch',
    idle: 'bg-[#F8E3E0] text-[#A32720]',
    idleCount: 'bg-white/70 text-[#A32720]',
    selected: 'bg-[#CF3B32] text-white',
    selectedCount: 'bg-white/25 text-white',
  },
  {
    key: 'no_mismatch',
    label: 'No mismatch',
    idle: 'bg-[#E2F1E8] text-[#17693F]',
    idleCount: 'bg-white/70 text-[#17693F]',
    selected: 'bg-[#2B965C] text-white',
    selectedCount: 'bg-white/25 text-white',
  },
]

function FilterButton({ filter, active, count, onClick }) {
  return (
    <button
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold leading-none transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100 ${active ? filter.selected : filter.idle}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {filter.label}
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${active ? filter.selectedCount : filter.idleCount}`}
      >
        {count}
      </span>
    </button>
  )
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1

function emailNumber(item) {
  const match = String(item.email_id || item.display_id || '').match(/\d+/)
  return match ? Number(match[0]) : 0
}

export function InboxPage({ navigate, initialStatus = '', from = null }) {
  const backToOutcomes = from === 'outcomes'
  const isReviewQueue = initialStatus === 'needs_review'
  const [activeFilter, setActiveFilter] = useState(initialStatus || '')
  const [query, setQuery] = useState('')
  const [data, setData] = useState({ items: [], total: 0 })
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortDirection, setSortDirection] = useState('asc')
  const [hiddenCategories, setHiddenCategories] = useState([])
  const [zoom, setZoom] = useState(1)

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

  const categoryCounts = useMemo(
    () =>
      data.items.reduce((counts, item) => {
        counts[item.category] = (counts[item.category] || 0) + 1
        return counts
      }, {}),
    [data.items],
  )

  const visibleItems = useMemo(
    () => data.items.filter((item) => !hiddenCategories.includes(item.category)),
    [data.items, hiddenCategories],
  )

  const sortedItems = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...visibleItems].sort((a, b) => (emailNumber(a) - emailNumber(b)) * direction)
  }, [visibleItems, sortDirection])

  function changeZoom(delta) {
    setZoom((current) =>
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((current + delta) * 10) / 10)),
    )
  }

  function toggleCategory(key) {
    setHiddenCategories((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    )
  }

  const SortIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown

  const counts = {
    '': summary?.emails_processed ?? 0,
    needs_review: summary?.needs_review ?? 0,
    mismatch: summary?.mismatches_found ?? 0,
    no_mismatch: summary?.outcomes?.OK ?? 0,
  }

  return (
    <div className="mx-auto max-w-[1540px] px-5 py-10 lg:px-14">
      <button
        type="button"
        onClick={() => navigate(backToOutcomes ? '/dashboard#comparison-outcomes' : '/dashboard')}
        className="mb-6 inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-white px-4 text-sm font-semibold leading-none text-[#26353D] shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        <ArrowLeft size={16} className="shrink-0" />
        {backToOutcomes ? 'Back to comparison outcomes' : 'Back to home'}
      </button>
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
        <div className="ml-auto flex flex-wrap gap-3">
          <CategoryFilter
            hidden={hiddenCategories}
            counts={categoryCounts}
            onToggle={toggleCategory}
            onShowAll={() => setHiddenCategories([])}
            onHideAll={() => setHiddenCategories(Object.keys(CATEGORY_LABELS))}
          />
          <button
            type="button"
            onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
            aria-label={`Sort by email ID, ${sortDirection === 'asc' ? 'ascending' : 'descending'}. Click to reverse.`}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-white px-4 text-sm font-semibold leading-none text-[#26353D] shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            <SortIcon size={16} weight="bold" className="shrink-0" />
            Email ID · {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.32fr)] xl:items-start">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-end gap-2 text-sm text-[#46555E]">
            <span className="mr-1 hidden text-xs text-[#71808A] sm:inline">
              Scroll sideways to see every column
            </span>
            <button
              type="button"
              onClick={() => changeZoom(-ZOOM_STEP)}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Zoom out table"
              className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#26353D] shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-sm motion-reduce:transition-none"
            >
              <MagnifyingGlassMinus size={16} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label="Reset table zoom to 100%"
              title="Reset zoom"
              className="h-9 min-w-[3.5rem] rounded-lg bg-white px-2 font-mono text-xs font-semibold text-[#26353D] shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => changeZoom(ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Zoom in table"
              className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#26353D] shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-sm motion-reduce:transition-none"
            >
              <MagnifyingGlassPlus size={16} weight="bold" />
            </button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[#E3DED1] bg-white">
            <div className="min-w-[1120px]" style={{ zoom }}>
              <div className="grid grid-cols-[120px_minmax(260px,1.8fr)_190px_170px_minmax(220px,1fr)_32px] gap-4 bg-[#FBF9F4] px-6 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#71808A]">
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
                sortedItems.map((item) => (
                  <button
                    key={item.email_id}
                    onClick={() =>
                      navigate(
                        item.status === 'NEEDS_REVIEW'
                          ? `/review/${item.email_id}`
                          : `/inbox/${item.email_id}`,
                      )
                    }
                    className="grid w-full gap-4 border-t border-[#E9E5D9] px-6 py-5 text-left transition-colors hover:bg-[#FCFAF4] grid-cols-[120px_minmax(260px,1.8fr)_190px_170px_minmax(220px,1fr)_32px] items-center"
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
                    <ArrowRight size={18} className="text-[#71808A]" />
                  </button>
                ))}
              {!loading && !sortedItems.length && (
                <div className="px-6 py-14 text-center text-sm text-[#71808A]">
                  {data.items.length
                    ? 'Every matching email is in a hidden category. Use Categories to show them.'
                    : 'No emails match this filter.'}
                </div>
              )}
            </div>
          </div>
        </div>

        <InboxSidePanel filter={activeFilter} summary={summary} items={data.items} />
      </div>

      <p className="mt-5 text-sm text-[#71808A]">
        Showing {sortedItems.length} of {data.total} emails. Only document-comparison emails get a
        comparison status; every other category is classified and set aside.
      </p>
    </div>
  )
}
