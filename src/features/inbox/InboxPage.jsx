import { useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass, Paperclip } from '@phosphor-icons/react'

import { CategoryBadge } from '@/components/layout/StatusBadge'
import { BackendError } from '@/components/BackendError'
import { getAllEmails } from '@/lib/api'
import { businessDateKey } from '@/lib/time'
import { formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

const CATEGORY_FILTERS = [
  { key: '', label: 'All' },
  { key: 'BL_COMPARISON', label: 'Document comparison' },
  { key: 'SI_REQUEST', label: 'New SI request' },
  { key: 'INVOICE_QUERY', label: 'Invoice query' },
  { key: 'GENERAL', label: 'General' },
  { key: 'SPAM', label: 'Spam' },
]

const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier']

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

export function InboxPage({ navigate }) {
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

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
  }, [query, retryNonce])

  const visibleItems = useMemo(
    () => data.items.filter((item) => !category || item.category === category),
    [category, data.items],
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

      <div className="mt-9 flex flex-wrap gap-3">
        {CATEGORY_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setCategory(filter.key)}
            aria-pressed={category === filter.key}
            className={cn(
              'inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold leading-none transition-colors',
              category === filter.key
                ? 'bg-[#16232B] text-white'
                : 'bg-white text-[#46555E] shadow-sm hover:bg-[#FBF9F4]',
            )}
          >
            {filter.label}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs',
                category === filter.key ? 'bg-[#294A5C] text-white' : 'bg-[#E9E5D9] text-[#46555E]',
              )}
            >
              {counts[filter.key] || 0}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-8">
        {loading && <div className="py-14 text-center text-sm text-[#71808A]">Loading emails…</div>}
        {!loading && !error &&
          GROUP_ORDER.map((key) => (
            <section key={key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#8A7F68]">
                {key}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-[#E3DED1] bg-white">
                {grouped[key].map((item) => (
                  <button
                    key={item.email_id}
                    onClick={() => navigate(`/inbox/${item.email_id}`)}
                    className="grid w-full grid-cols-1 gap-2 border-t border-[#E9E5D9] px-6 py-4 text-left transition-colors first:border-t-0 hover:bg-[#FCFAF4] sm:grid-cols-[160px_minmax(0,1fr)_190px_110px] sm:items-start sm:gap-4"
                  >
                    <span className="font-mono text-xs text-[#71808A]">
                      {item.display_id} · {formatDate(item.received_at)}
                    </span>
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
