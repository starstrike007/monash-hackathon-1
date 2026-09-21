import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarBlank, CaretDown, Funnel, MagnifyingGlass, Paperclip } from '@phosphor-icons/react'

import { CategoryBadge } from '@/components/layout/StatusBadge'
import { BackendError } from '@/components/BackendError'
import { LoadingBoat } from '@/components/LoadingBoat'
import { getAllEmails } from '@/lib/api'
import {
  persistVisitedEmailIds,
  readSession,
  readVisitedEmailIds,
  saveScrollAnchor,
  useRestoreScroll,
  writeSession,
} from '@/lib/listViewState'
import { businessDateKey, formatBusinessDateTimeParts, GROUP_ORDER, groupFor } from '@/lib/time'
import { cn } from '@/lib/utils'

function ReceivedAt({ value }) {
  const parts = formatBusinessDateTimeParts(value)
  return (
    <span className="flex flex-col text-xs leading-snug text-[#64748B] sm:items-end sm:text-right">
      <span className="font-medium text-[#475569]">{parts?.date ?? '—'}</span>
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
const VIEW_STATE_STORAGE_KEY = 'clearance:inbox-view-state'
const SCROLL_RESTORE_STORAGE_KEY = 'clearance:inbox-scroll-restore'

function readViewState(initialCategory) {
  const fallback = {
    selectedCategories: ALL_CATEGORY_KEYS,
    showAll: true,
    selectedPeriods: GROUP_ORDER,
    query: '',
  }
  // A ?category= link (from the Dashboard) shows exactly that category, or everything for
  // "all", with no leftover time-period or search filter. Coming back from an email keeps the
  // filters the person had instead.
  const returning = readSession(SCROLL_RESTORE_STORAGE_KEY) !== null
  if (!returning && initialCategory === 'all') return fallback
  if (!returning && ALL_CATEGORY_KEYS.includes(initialCategory)) {
    return { ...fallback, selectedCategories: [initialCategory], showAll: false }
  }
  try {
    const stored = readSession(VIEW_STATE_STORAGE_KEY)
    if (!stored) return fallback
    const onlyKnown = (values, allowed) =>
      Array.isArray(values) ? values.filter((value) => allowed.includes(value)) : allowed
    return {
      selectedCategories: onlyKnown(stored.selectedCategories, ALL_CATEGORY_KEYS),
      showAll: stored.showAll !== false,
      selectedPeriods: onlyKnown(stored.selectedPeriods, GROUP_ORDER),
      query: typeof stored.query === 'string' ? stored.query : '',
    }
  } catch {
    return fallback
  }
}

function filterByCategories(items, selectedCategories, showAll) {
  if (showAll) return items
  return items.filter((item) => selectedCategories.includes(item.category))
}

export function InboxPage({ navigate, initialCategory = '' }) {
  const [initialView] = useState(() => readViewState(initialCategory))
  const [selectedCategories, setSelectedCategories] = useState(initialView.selectedCategories)
  const [showAll, setShowAll] = useState(initialView.showAll)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [selectedPeriods, setSelectedPeriods] = useState(initialView.selectedPeriods)
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false)
  const [query, setQuery] = useState(initialView.query)
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [businessDay, setBusinessDay] = useState(() => businessDateKey(new Date()))
  const [visitedEmailIds, setVisitedEmailIds] = useState(readVisitedEmailIds)
  const categoryMenuRef = useRef(null)
  const periodMenuRef = useRef(null)

  // Keep the filters when an email is opened and the inbox is mounted again.
  useEffect(() => {
    writeSession(VIEW_STATE_STORAGE_KEY, { selectedCategories, showAll, selectedPeriods, query })
  }, [selectedCategories, showAll, selectedPeriods, query])

  // After returning from an email, put its row back where it was on screen.
  useRestoreScroll(SCROLL_RESTORE_STORAGE_KEY, !loading && !error)

  useEffect(() => {
    if (!categoryMenuOpen && !periodMenuOpen) return undefined

    function closeOnOutsideClick(event) {
      if (!categoryMenuRef.current?.contains(event.target)) setCategoryMenuOpen(false)
      if (!periodMenuRef.current?.contains(event.target)) setPeriodMenuOpen(false)
    }

    function closeOnEscape(event) {
      if (event.key !== 'Escape') return
      setCategoryMenuOpen(false)
      setPeriodMenuOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [categoryMenuOpen, periodMenuOpen])

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

  const periodsFiltered = selectedPeriods.length < GROUP_ORDER.length
  const shownCount = GROUP_ORDER.reduce(
    (total, key) => total + (selectedPeriods.includes(key) ? grouped[key].length : 0),
    0,
  )

  function togglePeriod(period) {
    setSelectedPeriods((current) =>
      current.includes(period) ? current.filter((key) => key !== period) : [...current, period],
    )
  }

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

  function openEmail(emailId, row) {
    saveScrollAnchor(SCROLL_RESTORE_STORAGE_KEY, emailId, row)
    const nextVisitedEmailIds = new Set(visitedEmailIds)
    nextVisitedEmailIds.add(emailId)
    setVisitedEmailIds(nextVisitedEmailIds)
    persistVisitedEmailIds(nextVisitedEmailIds)
    navigate(`/inbox/${emailId}`)
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-14">
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#475569]">{shownCount} emails</p>
          <h1 className="font-display mt-1 text-[2.75rem] font-semibold tracking-[-0.02em] text-[#0F172A]">
            Inbox
          </h1>
        </div>
        <label className="flex h-14 w-full items-center gap-3 rounded-xl border border-[#CBD5E1] bg-white px-5 text-[#64748B] sm:max-w-[420px]">
          <MagnifyingGlass size={20} />
          <span className="sr-only">Search inbox</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search subject, sender or email ID"
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
              ? 'bg-[#0F172A] text-white'
              : 'border border-[#B4C8EC] bg-[#E6EEFC] text-[#0F172A] hover:bg-[#D6E3FA]',
          )}
        >
          All emails
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs',
              showAll ? 'bg-[#334155] text-white' : 'bg-[#E2E8F0] text-[#475569]',
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
                ? 'bg-[#0F172A] text-white'
                : 'border border-[#B4C8EC] bg-[#E6EEFC] text-[#0F172A] hover:bg-[#D6E3FA]',
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
              className="absolute left-0 z-20 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-lg"
            >
              <div className="flex items-center justify-between gap-4 border-b border-[#E2E8F0] pb-3">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#64748B]">
                  Show categories
                </span>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={selectAllCategories}
                    className="text-[#0F172A] hover:underline"
                  >
                    Show all
                  </button>
                  <button
                    type="button"
                    onClick={hideAllCategories}
                    className="text-[#64748B] hover:text-[#0F172A] hover:underline"
                  >
                    Hide all
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {CATEGORY_FILTERS.map((filter) => (
                  <label
                    key={filter.key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[#1E293B] hover:bg-[#F8FAFC]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(filter.key)}
                      onChange={() => toggleCategory(filter.key)}
                      className="h-4 w-4 shrink-0 accent-[#0F172A]"
                    />
                    <span className="min-w-0 flex-1 truncate">{filter.label}</span>
                    <span className="font-mono text-xs text-[#64748B]">
                      {counts[filter.key] || 0}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative sm:ml-auto" ref={periodMenuRef}>
          <button
            type="button"
            onClick={() => setPeriodMenuOpen((open) => !open)}
            aria-expanded={periodMenuOpen}
            aria-controls="inbox-period-filter"
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors',
              periodsFiltered
                ? 'bg-[#0F172A] text-white'
                : 'border border-[#B4C8EC] bg-[#E6EEFC] text-[#0F172A] hover:bg-[#D6E3FA]',
            )}
          >
            <CalendarBlank size={17} aria-hidden="true" />
            Time period
            {periodsFiltered && (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                {selectedPeriods.length}
              </span>
            )}
            <CaretDown
              size={15}
              aria-hidden="true"
              className={cn('transition-transform', periodMenuOpen && 'rotate-180')}
            />
          </button>

          {periodMenuOpen && (
            <div
              id="inbox-period-filter"
              role="dialog"
              aria-label="Filter time period"
              className="absolute right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2.5rem))] rounded-2xl border border-[#E3DED1] bg-white p-4 shadow-xl"
            >
              <div className="flex items-center justify-between gap-4 border-b border-[#E9E5D9] pb-3">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8A7F68]">
                  Show time periods
                </span>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setSelectedPeriods(GROUP_ORDER)}
                    className="text-[#0E5A66] hover:underline"
                  >
                    Show all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPeriods([])}
                    className="text-[#62757D] hover:text-[#16232B] hover:underline"
                  >
                    Hide all
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {GROUP_ORDER.map((period) => (
                  <label
                    key={period}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[#26353D] hover:bg-[#FBF9F4]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPeriods.includes(period)}
                      onChange={() => togglePeriod(period)}
                      className="h-4 w-4 shrink-0 accent-[#0E5A66]"
                    />
                    <span className="min-w-0 flex-1 truncate">{period}</span>
                    <span className="font-mono text-xs text-[#71808A]">
                      {grouped[period].length}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-8">
        {loading && <LoadingBoat label="Loading inbox" />}
        {!loading &&
          !error &&
          GROUP_ORDER.filter((key) => selectedPeriods.includes(key) && grouped[key].length).map(
            (key) => (
              <section key={key}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#475569]">
                  {key}
                </h2>
                <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
                  {grouped[key].map((item) => (
                    <button
                      key={item.email_id}
                      type="button"
                      data-email-id={item.email_id}
                      onClick={(event) => openEmail(item.email_id, event.currentTarget)}
                      className={cn(
                        'grid w-full grid-cols-1 gap-2 border-t border-[#E2E8F0] px-6 py-4 text-left transition-colors first:border-t-0 sm:grid-cols-[90px_minmax(0,1fr)_190px_70px_100px] sm:items-start sm:gap-4',
                        visitedEmailIds.has(item.email_id)
                          ? 'bg-[#F1F5F9] hover:bg-[#E2E8F0]'
                          : 'bg-white hover:bg-[#F8FAFC]',
                      )}
                    >
                      <span className="font-mono text-xs text-[#64748B]">{item.display_id}</span>
                      <span className="min-w-0">
                        <strong className="line-clamp-2 text-[15px] leading-snug text-[#1E293B]">
                          {item.subject}
                        </strong>
                        <span className="mt-1 block truncate text-sm text-[#64748B]">
                          {item.sender}
                        </span>
                      </span>
                      <span>
                        <CategoryBadge category={item.category} />
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-[#64748B]">
                        <Paperclip size={16} />
                        {item.attachments?.length || 0}
                      </span>
                      <ReceivedAt value={item.received_at} />
                    </button>
                  ))}
                </div>
              </section>
            ),
          )}
        {!loading && !error && !shownCount && (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white py-14 text-center text-sm text-[#64748B]">
            No emails match this filter.
          </div>
        )}
      </div>
    </div>
  )
}
