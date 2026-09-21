import { useEffect, useMemo, useState } from 'react'
import { CalendarBlank, Funnel, MagnifyingGlass } from '@phosphor-icons/react'

import { BackendError } from '@/components/BackendError'
import { FilterMenu } from '@/components/FilterMenu'
import { LoadingBoat } from '@/components/LoadingBoat'
import { ReceivedAt } from '@/components/ReceivedAt'
import { reasonLabel } from '@/features/review-queue/reasons'
import { getAllEmails, getReviewItems } from '@/lib/api'
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

const REASON_FILTERS = [
  { key: 'wrong_doc_type', label: 'Wrong document type' },
  { key: 'missing_attachment', label: 'Missing attachment' },
  { key: 'unreadable', label: 'Unreadable' },
  { key: 'missing_value', label: 'Missing value' },
  { key: 'manual_escalation', label: 'Escalated' },
]
const ALL_REASON_KEYS = REASON_FILTERS.map((filter) => filter.key)
// v2: the category list gained "Escalated"; a saved list of the old four would hide those items.
const VIEW_STATE_STORAGE_KEY = 'clearance:review-queue-view-state-v2'
const SCROLL_RESTORE_STORAGE_KEY = 'clearance:review-queue-scroll-restore'

function reasonFilterKey(reason) {
  return reason === 'processing_failed' ? 'unreadable' : reason
}

function readViewState(initialReason) {
  const normalizedReason = reasonFilterKey(initialReason)
  const defaultReasons = ALL_REASON_KEYS.includes(normalizedReason)
    ? [normalizedReason]
    : ALL_REASON_KEYS
  const stored = readSession(VIEW_STATE_STORAGE_KEY)
  if (!stored) return { selectedReasons: defaultReasons, selectedPeriods: GROUP_ORDER, query: '' }

  const onlyKnown = (values, allowed, fallback) =>
    Array.isArray(values) ? values.filter((value) => allowed.includes(value)) : fallback
  return {
    selectedReasons: onlyKnown(stored.selectedReasons, ALL_REASON_KEYS, defaultReasons),
    selectedPeriods: onlyKnown(stored.selectedPeriods, GROUP_ORDER, GROUP_ORDER),
    query: typeof stored.query === 'string' ? stored.query : '',
  }
}

export function ReviewQueuePage({ navigate, initialReason = '' }) {
  const [initialView] = useState(() => readViewState(initialReason))
  const [statusFilter, setStatusFilter] = useState('open')
  const [selectedReasons, setSelectedReasons] = useState(initialView.selectedReasons)
  const [selectedPeriods, setSelectedPeriods] = useState(initialView.selectedPeriods)
  const [query, setQuery] = useState(initialView.query)
  const [items, setItems] = useState([])
  const [emailsById, setEmailsById] = useState({})
  const [emailsReady, setEmailsReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [visitedEmailIds, setVisitedEmailIds] = useState(readVisitedEmailIds)

  useEffect(() => {
    writeSession(VIEW_STATE_STORAGE_KEY, { selectedReasons, selectedPeriods, query })
  }, [selectedPeriods, selectedReasons, query])

  useEffect(() => {
    getAllEmails({})
      .then((data) => {
        setEmailsById(Object.fromEntries((data.items || []).map((item) => [item.email_id, item])))
        setEmailsReady(true)
      })
      .catch(setError)
  }, [retryNonce])

  useEffect(() => {
    setLoading(true)
    getReviewItems({ status: statusFilter })
      .then((data) => {
        setItems(data.items || [])
        setLoading(false)
      })
      .catch((reason) => {
        setError(reason)
        setLoading(false)
      })
  }, [statusFilter, retryNonce])

  // Search subject, sender or ID. Counts in the filter menus follow the search, as in the inbox.
  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => {
      const email = emailsById[item.email_id]
      return [email?.subject, email?.sender, email?.display_id, item.email_id].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(needle),
      )
    })
  }, [items, emailsById, query])

  const reasonCounts = useMemo(() => {
    const counts = Object.fromEntries(ALL_REASON_KEYS.map((reason) => [reason, 0]))
    for (const item of searched) {
      const key = reasonFilterKey(item.reason)
      if (key in counts) counts[key] += 1
    }
    return counts
  }, [searched])

  const reasonFiltered = useMemo(() => {
    if (selectedReasons.length === ALL_REASON_KEYS.length) return searched
    return searched.filter((item) => selectedReasons.includes(reasonFilterKey(item.reason)))
  }, [searched, selectedReasons])

  const periodCounts = useMemo(() => {
    const counts = Object.fromEntries(GROUP_ORDER.map((period) => [period, 0]))
    const now = new Date()
    for (const item of reasonFiltered) {
      const period = groupFor(emailsById[item.email_id]?.received_at || item.created_at, now)
      counts[period] += 1
    }
    return counts
  }, [emailsById, reasonFiltered])

  const visible = useMemo(() => {
    const now = new Date()
    return reasonFiltered.filter((item) =>
      selectedPeriods.includes(
        groupFor(emailsById[item.email_id]?.received_at || item.created_at, now),
      ),
    )
  }, [emailsById, reasonFiltered, selectedPeriods])

  // Group under Today, Yesterday, ... newest first, like the inbox and Document comparison.
  const grouped = useMemo(() => {
    const now = new Date()
    const receivedOf = (item) => emailsById[item.email_id]?.received_at || item.created_at
    const buckets = Object.fromEntries(GROUP_ORDER.map((key) => [key, []]))
    for (const item of visible) buckets[groupFor(receivedOf(item), now)].push(item)
    for (const key of GROUP_ORDER) {
      buckets[key].sort((a, b) => new Date(receivedOf(b) || 0) - new Date(receivedOf(a) || 0))
    }
    return buckets
  }, [emailsById, visible])

  const ready = !loading && emailsReady && !error

  // After returning from a review item, put its row back where it was on screen.
  useRestoreScroll(SCROLL_RESTORE_STORAGE_KEY, ready)

  function openItem(item, row) {
    saveScrollAnchor(SCROLL_RESTORE_STORAGE_KEY, item.id, row)
    const nextVisitedEmailIds = new Set(visitedEmailIds)
    nextVisitedEmailIds.add(item.email_id)
    setVisitedEmailIds(nextVisitedEmailIds)
    persistVisitedEmailIds(nextVisitedEmailIds)
    navigate(`/review/${item.id}`)
  }

  const periodsFiltered = selectedPeriods.length < GROUP_ORDER.length

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-14">
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#475569]">{visible.length} items</p>
          <h1 className="font-display mt-1 text-[2.75rem] font-semibold tracking-[-0.02em] text-[#0F172A]">
            Human review
          </h1>
        </div>
        <label className="flex h-14 w-full items-center gap-3 rounded-xl border border-[#CBD5E1] bg-white px-5 text-[#64748B] sm:max-w-[420px]">
          <MagnifyingGlass size={20} />
          <span className="sr-only">Search human review</span>
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

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-[#E2E8F0] p-1">
          {['open', 'resolved'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              aria-pressed={statusFilter === status}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-semibold capitalize',
                statusFilter === status
                  ? 'border border-slate-200 bg-white text-[#0F172A]'
                  : 'text-[#64748B]',
              )}
            >
              {status}
            </button>
          ))}
        </div>
        <FilterMenu
          id="review-reason-filter"
          label="Categories"
          title="Show review categories"
          icon={Funnel}
          options={REASON_FILTERS.map((filter) => ({
            ...filter,
            count: reasonCounts[filter.key],
          }))}
          selected={selectedReasons}
          onChange={setSelectedReasons}
        />

        <FilterMenu
          id="review-period-filter"
          label="Time period"
          title="Show time periods"
          icon={CalendarBlank}
          options={GROUP_ORDER.map((period) => ({
            key: period,
            label: period,
            count: periodCounts[period],
          }))}
          selected={selectedPeriods}
          onChange={setSelectedPeriods}
          align="right"
          className="sm:ml-auto"
        />
      </div>

      <div className="mt-6 space-y-8">
        {!ready && !error && <LoadingBoat label="Loading human review" />}
        {ready &&
          GROUP_ORDER.filter((key) => grouped[key].length).map((key) => (
            <section key={key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#475569]">
                {key}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
                {grouped[key].map((item) => {
                  const email = emailsById[item.email_id]
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-email-id={item.id}
                      onClick={(event) => openItem(item, event.currentTarget)}
                      className={cn(
                        'grid w-full grid-cols-1 gap-2 border-t border-[#E2E8F0] px-6 py-4 text-left transition-colors first:border-t-0 lg:grid-cols-[90px_minmax(0,1.4fr)_170px_minmax(0,1.2fr)_100px] lg:items-start lg:gap-4',
                        visitedEmailIds.has(item.email_id)
                          ? 'bg-[#F1F5F9] hover:bg-[#E2E8F0]'
                          : 'bg-white hover:bg-[#F8FAFC]',
                      )}
                    >
                      <span className="font-mono text-xs text-[#64748B]">
                        {email?.display_id || item.email_id}
                      </span>
                      <span className="min-w-0">
                        <strong className="line-clamp-2 text-[15px] leading-snug text-[#1E293B]">
                          {email?.subject || item.email_id}
                        </strong>
                        {email?.sender && (
                          <span className="mt-1 block truncate text-sm text-[#64748B]">
                            {email.sender}
                          </span>
                        )}
                      </span>
                      <span>
                        <span className="inline-flex w-fit items-center rounded-md bg-[#CBD5E1] px-2 py-1 font-mono text-xs font-medium text-[#1E293B]">
                          {reasonLabel(item.reason)}
                        </span>
                      </span>
                      <span className="line-clamp-2 text-sm text-[#64748B]">
                        {item.description}
                      </span>
                      <ReceivedAt value={email?.received_at || item.created_at} />
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        {ready && !visible.length && (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white py-14 text-center text-sm text-[#64748B]">
            {query.trim()
              ? 'No review items match your search.'
              : `Nothing here. ${statusFilter === 'open' ? 'Nothing is waiting for human review.' : 'No resolved items yet.'}`}
          </div>
        )}
      </div>
    </div>
  )
}
