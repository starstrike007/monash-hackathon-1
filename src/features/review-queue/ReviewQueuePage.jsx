import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'

import { BackendError } from '@/components/BackendError'
import { reasonLabel } from '@/features/review-queue/reasons'
import { getAllEmails, getReviewItems } from '@/lib/api'
import { formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

const REASON_ORDER = [
  'unreadable',
  'missing_attachment',
  'missing_value',
  'wrong_doc_type',
  'processing_failed',
]

export function ReviewQueuePage({ navigate, initialReason = '' }) {
  const [statusFilter, setStatusFilter] = useState('open')
  const [reasonFilter, setReasonFilter] = useState(initialReason || '')
  const [items, setItems] = useState([])
  const [emailsById, setEmailsById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    getAllEmails({})
      .then((data) => {
        setEmailsById(Object.fromEntries((data.items || []).map((item) => [item.email_id, item])))
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

  const reasonCounts = useMemo(() => {
    const counts = {}
    for (const item of items) counts[item.reason] = (counts[item.reason] || 0) + 1
    return counts
  }, [items])

  const visible = useMemo(() => {
    const filtered = reasonFilter ? items.filter((item) => item.reason === reasonFilter) : items
    return [...filtered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }, [items, reasonFilter])

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-14">
      <header>
        <p className="text-sm font-medium text-[#475569]">{items.length} items</p>
        <h1 className="mt-1 text-5xl font-semibold tracking-tight text-[#0F172A]">Review queue</h1>
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
        <button
          type="button"
          onClick={() => setReasonFilter('')}
          className={cn(
            'inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium',
            reasonFilter === ''
              ? 'bg-[#0F172A] text-white'
              : 'border border-slate-200 bg-white text-[#475569]',
          )}
        >
          All
        </button>
        {REASON_ORDER.filter((reason) => reasonCounts[reason]).map((reason) => (
          <button
            key={reason}
            type="button"
            onClick={() => setReasonFilter(reason)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium',
              reasonFilter === reason ? 'bg-[#D97706] text-white' : 'bg-[#FEF3C7] text-amber-700',
            )}
          >
            {reasonLabel(reason)}
            <span className="rounded-full bg-white/60 px-1.5 text-xs">{reasonCounts[reason]}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
        <div className="hidden grid-cols-[120px_150px_minmax(220px,1.6fr)_170px_minmax(220px,1.6fr)_32px] gap-4 bg-[#F8FAFC] px-6 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B] lg:grid">
          <span>Email</span>
          <span>Received</span>
          <span>Subject</span>
          <span>Reason</span>
          <span>Description</span>
          <span />
        </div>
        {loading && <div className="px-6 py-14 text-center text-sm text-[#64748B]">Loading…</div>}
        {!loading &&
          !error &&
          visible.map((item) => {
            const email = emailsById[item.email_id]
            return (
              <button
                key={item.id}
                onClick={() => navigate(`/review/${item.id}`)}
                className="grid w-full grid-cols-1 gap-3 border-t border-[#E2E8F0] px-6 py-5 text-left transition-colors hover:bg-[#F8FAFC] lg:grid-cols-[120px_150px_minmax(220px,1.6fr)_170px_minmax(220px,1.6fr)_32px] lg:items-center lg:gap-4"
              >
                <span className="font-mono text-sm text-[#64748B]">
                  {email?.display_id || item.email_id}
                </span>
                <span className="text-sm text-[#64748B]">{formatDate(email?.received_at)}</span>
                <strong className="min-w-0 truncate text-[15px] text-[#1E293B]">
                  {email?.subject || item.email_id}
                </strong>
                <span className="inline-flex w-fit items-center rounded-md bg-[#FEF3C7] px-2 py-1 font-mono text-xs font-medium text-amber-700">
                  {reasonLabel(item.reason)}
                </span>
                <span className="truncate text-sm text-[#64748B]">{item.description}</span>
                <ArrowRight size={18} className="hidden text-[#64748B] lg:block" />
              </button>
            )
          })}
        {!loading && !error && !visible.length && (
          <div className="px-6 py-14 text-center text-sm text-[#64748B]">
            Nothing here.{' '}
            {statusFilter === 'open' ? 'The review queue is clear.' : 'No resolved items yet.'}
          </div>
        )}
      </div>
    </div>
  )
}
