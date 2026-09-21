import { useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, Funnel, MagnifyingGlass, Paperclip } from '@phosphor-icons/react'

import { CategoryBadge } from '@/components/layout/StatusBadge'
import { BackendError } from '@/components/BackendError'
import { getAllEmails } from '@/lib/api'
import { businessDateKey, formatBusinessDateTimeParts } from '@/lib/time'
import { cn } from '@/lib/utils'

function ReceivedAt({ value }) {
  const parts = formatBusinessDateTimeParts(value)
  return (
    <span className="flex flex-col text-xs leading-snug text-[#71808A] sm:items-end sm:text-right">
      <span className="font-medium text-[#46555E]">{parts?.date ?? '—'}</span>
      {parts && <span>{parts.time}</span>}
    </span>
  )
}

const CATEGORY_FILTERS = [
  { key: 'BL_COMPARISON', label: 'Document comparison' },
  { key: 'SI_REQUEST', label: 'New SI request' },
  { key: 'INVOICE_QUERY', label: 'Invoice query' },
  { key: 'GENERAL', label: 'General' },
  { key: 'SPAM', label: 'Spam' },
]
const ALL_CATEGORY_KEYS = CATEGORY_FILTERS.map((filter) => filter.key)
const VISITED_EMAILS_STORAGE_KEY = 'clearance:visited-email-ids'

const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier']

function readVisitedEmailIds() {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = JSON.parse(window.localStorage.getItem(VISITED_EMAILS_STORAGE_KEY) || '[]')
    return new Set(Array.isArray(stored) ? stored : [])
  } catch {
    return new Set()
  }
}

function persistVisitedEmailIds(emailIds) {
  try {
    window.localStorage.setItem(VISITED_EMAILS_STORAGE_KEY, JSON.stringify([...emailIds]))
  } catch {
    // Browsers may block storage; the in-memory state still provides feedback for this visit.
  }
}

function groupFor(receivedAt, now) {
  if (!receivedAt) return 'Earlier'
  const today = businessDateKey(now)
  const received = businessDateKey(receivedAt)
  if (!today || !received) return 'Earlier'
  const diffDays = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${received}T00:00:00Z`)) / 86400000,
  )
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays <= 6) return 'This week'
  if (diffDays <= 29) return 'This month'
  return 'Earlier'
}

function filterByCategories(items, selectedCategories, showAll) {
  if (showAll) return items
  return items.filter((item) => selectedCategories.includes(item.category))
}

export function InboxPage({ navigate }) {
  const [selectedCategories, setSelectedCategories] = useState(ALL_CATEGORY_KEYS)
  const [showAll, setShowAll] = useState(true)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [businessDay, setBusinessDay] = useState(() => businessDateKey(new Date()))
  const [visitedEmailIds, setVisitedEmailIds] = useState(readVisitedEmailIds)
  const categoryMenuRef = useRef(null)

  useEffect(() => {
    if (!categoryMenuOpen) return undefined

    function closeOnOutsideClick(event) {
      if (!categoryMenuRef.current?.contains(event.target)) setCategoryMenuOpen(false)
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setCategoryMenuOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [categoryMenuOpen])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextBusinessDay = businessDateKey(new Date())
      setBusinessDay((currentBusinessDay) =>
        nextBusinessDay === currentBusinessDay ? currentBusinessDay : nextBusinessDay,
      )
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    getAllEmails({ query })
      .then((result) => {
        setData(result)
        setLoading(false)
      })
      .catch((reason) => {
        setError(reason)
        setLoading(false)
      })
  }, [businessDay, query, retryNonce])

  useEffect(() => {
    persistVisitedEmailIds(visitedEmailIds)
  }, [visitedEmailIds])

  const visibleItems = useMemo(
    () => filterByCategories(data.items, selectedCategories, showAll),
    [data.items, selectedCategories, showAll],
  )

  const counts = useMemo(() => {
    const tally = { '': data.items.length }
    for (const item of data.items) tally[item.category] = (tally[item.category] || 0) + 1
    return tally
  }, [data.items])

  const grouped = useMemo(() => {
    const now = new Date()
    const buckets = Object.fromEntries(GROUP_ORDER.map((key) => [key, []]))
    for (const item of visibleItems) buckets[groupFor(item.received_at, now)].push(item)
    for (const key of GROUP_ORDER) {
      buckets[key].sort((a, b) => new Date(b.received_at || 0) - new Date(a.received_at || 0))
    }
    return buckets
  }, [visibleItems])

  function selectAllCategories() {
    setSelectedCategories(ALL_CATEGORY_KEYS)
    setShowAll(true)
  }

  function hideAllCategories() {
    setSelectedCategories([])
    setShowAll(false)
  }

  function toggleCategory(categoryKey) {
    const next = selectedCategories.includes(categoryKey)
      ? selectedCategories.filter((key) => key !== categoryKey)
      : [...selectedCategories, categoryKey]
    setSelectedCategories(next)
    setShowAll(next.length === ALL_CATEGORY_KEYS.length)
  }

  function openEmail(emailId) {
    const nextVisitedEmailIds = new Set(visitedEmailIds)
    nextVisitedEmailIds.add(emailId)
    setVisitedEmailIds(nextVisitedEmailIds)
    persistVisitedEmailIds(nextVisitedEmailIds)
    navigate(`/inbox/${emailId}`)
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10 lg:px-14">
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#62757D]">{visibleItems.length} emails</p>
          <h1 className="mt-1 font-serif text-5xl font-semibold tracking-tight text-[#16232B]">
            Inbox
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

      {error && (
        <div className="mt-7">
          <BackendError error={error} onRetry={() => setRetryNonce((value) => value + 1)} />
        </div>
      )}

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={selectAllCategories}
          aria-pressed={showAll}
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors',
            showAll
              ? 'bg-[#16232B] text-white'
              : 'bg-white text-[#46555E] shadow-sm hover:bg-[#FBF9F4]',
          )}
        >
          All emails
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs',
              showAll ? 'bg-[#294A5C] text-white' : 'bg-[#E9E5D9] text-[#46555E]',
            )}
          >
            {counts['']}
          </span>
        </button>

        <div className="relative" ref={categoryMenuRef}>
          <button
            type="button"
            onClick={() => setCategoryMenuOpen((open) => !open)}
            aria-expanded={categoryMenuOpen}
            aria-controls="inbox-category-filter"
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors',
              !showAll
                ? 'bg-[#0E5A66] text-white shadow-sm'
                : 'bg-white text-[#46555E] shadow-sm hover:bg-[#FBF9F4]',
            )}
          >
            <Funnel size={17} aria-hidden="true" />
            Categories
            {!showAll && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                {selectedCategories.length}
              </span>
            )}
            <CaretDown
              size={15}
              aria-hidden="true"
              className={cn('transition-transform', categoryMenuOpen && 'rotate-180')}
            />
          </button>

          {categoryMenuOpen && (
            <div
              id="inbox-category-filter"
              role="dialog"
              aria-label="Filter categories"
              className="absolute left-0 z-20 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-[#E3DED1] bg-white p-4 shadow-xl"
            >
              <div className="flex items-center justify-between gap-4 border-b border-[#E9E5D9] pb-3">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8A7F68]">
                  Show categories
                </span>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={selectAllCategories}
                    className="text-[#0E5A66] hover:underline"
                  >
                    Show all
                  </button>
                  <button
                    type="button"
                    onClick={hideAllCategories}
                    className="text-[#62757D] hover:text-[#16232B] hover:underline"
                  >
                    Hide all
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {CATEGORY_FILTERS.map((filter) => (
                  <label
                    key={filter.key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[#26353D] hover:bg-[#FBF9F4]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(filter.key)}
                      onChange={() => toggleCategory(filter.key)}
                      className="h-4 w-4 shrink-0 accent-[#0E5A66]"
                    />
                    <span className="min-w-0 flex-1 truncate">{filter.label}</span>
                    <span className="font-mono text-xs text-[#71808A]">
                      {counts[filter.key] || 0}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-8">
        {loading && <div className="py-14 text-center text-sm text-[#71808A]">Loading emails…</div>}
        {!loading &&
          !error &&
          GROUP_ORDER.map((key) => (
            <section key={key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#8A7F68]">
                {key}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-[#E3DED1] bg-white">
                {grouped[key].map((item) => (
                  <button
                    key={item.email_id}
                    type="button"
                    onClick={() => openEmail(item.email_id)}
                    className={cn(
                      'grid w-full grid-cols-1 gap-2 border-t border-[#E9E5D9] px-6 py-4 text-left transition-colors first:border-t-0 sm:grid-cols-[90px_minmax(0,1fr)_190px_70px_100px] sm:items-start sm:gap-4',
                      visitedEmailIds.has(item.email_id)
                        ? 'bg-[#F6F3EC] hover:bg-[#F0ECE2]'
                        : 'bg-white hover:bg-[#FCFAF4]',
                    )}
                  >
                    <span className="font-mono text-xs text-[#71808A]">{item.display_id}</span>
                    <span className="min-w-0">
                      <strong className="line-clamp-2 text-[15px] leading-snug text-[#26353D]">
                        {item.subject}
                      </strong>
                      <span className="mt-1 block truncate text-sm text-[#71808A]">
                        {item.sender}
                      </span>
                    </span>
                    <span>
                      <CategoryBadge category={item.category} />
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-[#71808A]">
                      <Paperclip size={16} />
                      {item.attachments?.length || 0}
                    </span>
                    <ReceivedAt value={item.received_at} />
                  </button>
                ))}
                {!grouped[key].length && (
                  <p className="px-6 py-4 text-sm text-[#8A969B]">No emails in this period.</p>
                )}
              </div>
            </section>
          ))}
        {!loading && !error && !visibleItems.length && (
          <div className="rounded-2xl border border-[#E3DED1] bg-white py-14 text-center text-sm text-[#71808A]">
            No emails match this filter.
          </div>
        )}
      </div>
    </div>
  )
}
