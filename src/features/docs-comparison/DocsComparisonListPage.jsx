import { useEffect, useMemo, useState } from 'react'
import { CalendarBlank, Funnel, MagnifyingGlass } from '@phosphor-icons/react'

import { StatusBadge } from '@/components/layout/StatusBadge'
import { BackendError } from '@/components/BackendError'
import { FilterMenu } from '@/components/FilterMenu'
import { LoadingBoat } from '@/components/LoadingBoat'
import { ReceivedAt } from '@/components/ReceivedAt'
import { summarizeComparison } from '@/features/docs-comparison/summary'
import { getAllEmails } from '@/lib/api'
import {
  persistVisitedEmailIds,
  readSession,
  readVisitedEmailIds,
  saveScrollAnchor,
  useRestoreScroll,
  writeSession,
} from '@/lib/listViewState'
import { GROUP_ORDER, groupFor } from '@/lib/time'
import { cn } from '@/lib/utils'

// An email "needs review" when any field is unresolved, but fields that clearly differ are still
// recorded, so it also counts as a mismatch. The list shows both badges and both filters match.
const hasMismatch = (item) => item.status === 'MISMATCH' || item.defect_fields?.length > 0
const STATUS_FILTERS = [
  { key: 'mismatch', label: 'Mismatch', matches: hasMismatch },
  { key: 'no_mismatch', label: 'No mismatch', matches: (item) => item.status === 'OK' },
  { key: 'needs_review', label: 'Needs review', matches: (item) => item.status === 'NEEDS_REVIEW' },
]
const ALL_STATUS_KEYS = STATUS_FILTERS.map((filter) => filter.key)
const VIEW_STATE_STORAGE_KEY = 'clearance:docs-comparison-view-state'
const SCROLL_RESTORE_STORAGE_KEY = 'clearance:docs-comparison-scroll-restore'

function readViewState(initialStatus) {
  const fallback = { selectedStatuses: ALL_STATUS_KEYS, selectedPeriods: GROUP_ORDER, query: '' }
  // A ?status= link (from the Dashboard) shows exactly that status, or everything for "all",
  // with no leftover time-period or search filter. Coming back from an email keeps the
  // filters the person had instead.
  const returning = readSession(SCROLL_RESTORE_STORAGE_KEY) !== null
  if (!returning && initialStatus === 'all') return fallback
  if (!returning && ALL_STATUS_KEYS.includes(initialStatus)) {
    return { ...fallback, selectedStatuses: [initialStatus] }
  }
  const stored = readSession(VIEW_STATE_STORAGE_KEY)
  if (!stored) return fallback
  const onlyKnown = (values, allowed) =>
    Array.isArray(values) ? values.filter((value) => allowed.includes(value)) : allowed
  return {
    selectedStatuses: onlyKnown(stored.selectedStatuses, ALL_STATUS_KEYS),
    selectedPeriods: onlyKnown(stored.selectedPeriods, GROUP_ORDER),
    query: typeof stored.query === 'string' ? stored.query : '',
  }
}

export function DocsComparisonListPage({ navigate, initialStatus = '' }) {
  const [initialView] = useState(() => readViewState(initialStatus))
  const [selectedStatuses, setSelectedStatuses] = useState(initialView.selectedStatuses)
  const [selectedPeriods, setSelectedPeriods] = useState(initialView.selectedPeriods)
  const [query, setQuery] = useState(initialView.query)
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(null)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [visitedEmailIds, setVisitedEmailIds] = useState(readVisitedEmailIds)

  // Keep the filters when an email is opened and this list is mounted again.
  useEffect(() => {
    writeSession(VIEW_STATE_STORAGE_KEY, { selectedStatuses, selectedPeriods, query })
  }, [selectedStatuses, selectedPeriods, query])

  // After returning from an email, put its row back where it was on screen.
  useRestoreScroll(SCROLL_RESTORE_STORAGE_KEY, !loading && !error)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadingProgress(null)
    setError(null)
    getAllEmails(
      { category: 'BL_COMPARISON', query },
      {
        onProgress: (status) => {
          if (active) setLoadingProgress(status)
        },
      },
    )
      .then((result) => {
        if (!active) return
        setData(result)
        setLoading(false)
      })
      .catch((reason) => {
        if (!active) return
        setError(reason)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [query, retryNonce])

  function openEmail(emailId, row) {
    saveScrollAnchor(SCROLL_RESTORE_STORAGE_KEY, emailId, row)
    const nextVisitedEmailIds = new Set(visitedEmailIds)
    nextVisitedEmailIds.add(emailId)
    setVisitedEmailIds(nextVisitedEmailIds)
    persistVisitedEmailIds(nextVisitedEmailIds)
    navigate(`/docs-comparison/${emailId}`)
  }

  const allStatusesSelected = selectedStatuses.length === ALL_STATUS_KEYS.length

  const visibleItems = useMemo(() => {
    if (allStatusesSelected) return data.items
    const active = STATUS_FILTERS.filter((filter) => selectedStatuses.includes(filter.key))
    return data.items.filter((item) => active.some((filter) => filter.matches(item)))
  }, [allStatusesSelected, selectedStatuses, data.items])

  const grouped = useMemo(() => {
    const now = new Date()
    const buckets = Object.fromEntries(GROUP_ORDER.map((key) => [key, []]))
    for (const item of visibleItems) buckets[groupFor(item.received_at, now)].push(item)
    for (const key of GROUP_ORDER) {
      buckets[key].sort((a, b) => new Date(b.received_at || 0) - new Date(a.received_at || 0))
    }
    return buckets
  }, [visibleItems])

  const counts = useMemo(() => {
    const tally = { '': data.items.length, mismatch: 0, no_mismatch: 0, needs_review: 0 }
    for (const item of data.items) {
      for (const filter of STATUS_FILTERS) {
        if (filter.matches(item)) tally[filter.key] += 1
      }
    }
    return tally
  }, [data.items])

  const shownGroups = GROUP_ORDER.filter(
    (key) => selectedPeriods.includes(key) && grouped[key].length,
  )
  const shownCount = GROUP_ORDER.reduce(
    (total, key) => total + (selectedPeriods.includes(key) ? grouped[key].length : 0),
    0,
  )

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-14">
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#475569]">{shownCount} comparison requests</p>
          <h1 className="font-display mt-1 text-[2.75rem] font-semibold tracking-[-0.02em] text-[#0F172A]">
            Document comparison
          </h1>
        </div>
        <label className="flex h-14 w-full items-center gap-3 rounded-xl border border-[#CBD5E1] bg-white px-5 text-[#64748B] sm:max-w-[420px]">
          <MagnifyingGlass size={20} />
          <span className="sr-only">Search comparisons</span>
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
          onClick={() => setSelectedStatuses(ALL_STATUS_KEYS)}
          aria-pressed={allStatusesSelected}
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors',
            allStatusesSelected
              ? 'bg-[#0F172A] text-white'
              : 'border border-[#B4C8EC] bg-[#E6EEFC] text-[#0F172A] hover:bg-[#D6E3FA]',
          )}
        >
          All comparisons
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs',
              allStatusesSelected ? 'bg-[#334155] text-white' : 'bg-[#E2E8F0] text-[#475569]',
            )}
          >
            {counts['']}
          </span>
        </button>

        <FilterMenu
          id="docs-status-filter"
          label="Status"
          title="Show statuses"
          icon={Funnel}
          options={STATUS_FILTERS.map((filter) => ({
            key: filter.key,
            label: filter.label,
            count: counts[filter.key],
          }))}
          selected={selectedStatuses}
          onChange={setSelectedStatuses}
        />

        <FilterMenu
          id="docs-period-filter"
          label="Time period"
          title="Show time periods"
          icon={CalendarBlank}
          options={GROUP_ORDER.map((period) => ({
            key: period,
            label: period,
            count: grouped[period].length,
          }))}
          selected={selectedPeriods}
          onChange={setSelectedPeriods}
          align="right"
          className="sm:ml-auto"
        />
      </div>

      <div className="mt-6 space-y-8">
        {loading && (
          <LoadingBoat
            label="Loading document comparison"
            percentage={loadingProgress?.percentage}
            message={loadingProgress?.message}
          />
        )}
        {!loading &&
          !error &&
          shownGroups.map((key) => (
            <section key={key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#475569]">
                {key}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
                {grouped[key].map((item) => {
                  const summary = summarizeComparison(item)
                  return (
                    <button
                      key={item.email_id}
                      type="button"
                      data-email-id={item.email_id}
                      onClick={(event) => openEmail(item.email_id, event.currentTarget)}
                      className={cn(
                        'grid w-full grid-cols-1 gap-2 border-t border-[#E2E8F0] px-6 py-4 text-left transition-colors first:border-t-0 lg:grid-cols-[90px_minmax(0,1.4fr)_170px_minmax(0,1.2fr)_100px] lg:items-start lg:gap-4',
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
                      <span className="flex flex-col items-start gap-1">
                        <StatusBadge status={item.status} />
                        {/* Needs review takes priority as the status, but fields that clearly
                            differ are still recorded, so show that this email also has a mismatch. */}
                        {item.status === 'NEEDS_REVIEW' && hasMismatch(item) && (
                          <StatusBadge status="MISMATCH" />
                        )}
                      </span>
                      <span
                        className={`text-sm ${summary.tone === 'mismatch' ? 'text-[#B91C1C]' : summary.tone === 'review' ? 'text-[#B45309]' : 'text-[#64748B]'}`}
                      >
                        <span className="block line-clamp-1">
                          {summary.primaryText || summary.text}
                        </span>
                        {summary.secondaryText && (
                          <span className="mt-1 block line-clamp-1 text-[#B91C1C]">
                            {summary.secondaryText}
                          </span>
                        )}
                      </span>
                      <ReceivedAt value={item.received_at} />
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        {!loading && !error && !shownCount && (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white py-14 text-center text-sm text-[#64748B]">
            No document-comparison emails match this filter.
          </div>
        )}
      </div>
    </div>
  )
}
