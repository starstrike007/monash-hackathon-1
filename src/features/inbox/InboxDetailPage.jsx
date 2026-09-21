import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowSquareOut, CaretDown, Check, DownloadSimple } from '@phosphor-icons/react'

import { DocumentViewer } from '@/components/document-viewer/DocumentViewer'
import { BackendError } from '@/components/BackendError'
import { CategoryBadge } from '@/components/layout/StatusBadge'
import { summarizeComparison } from '@/features/docs-comparison/summary'
import {
  attachmentUrl,
  getEmail,
  getReviewItems,
  notifyDataChanged,
  overrideCategory,
} from '@/lib/api'
import { CATEGORY_LABELS, formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS)

function CategoryPicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function closeOnOutsideClick(event) {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-10 min-w-[13rem] items-center justify-between gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#475569] shadow-sm ring-1 ring-[#CBD5E1] transition-colors hover:bg-[#F8FAFC] disabled:opacity-60"
      >
        <span className="truncate">{CATEGORY_LABELS[value] || 'Select category'}</span>
        <CaretDown
          size={15}
          aria-hidden="true"
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Category"
          className="absolute left-0 z-20 mt-2 w-[min(18rem,calc(100vw-2.5rem))] rounded-2xl border border-[#CBD5E1] bg-white p-2 shadow-xl"
        >
          {CATEGORY_OPTIONS.map((key) => (
            <li key={key} role="option" aria-selected={key === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(key)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-[#1E293B] hover:bg-[#F8FAFC]',
                  key === value && 'bg-[#F1F5F9] font-semibold text-[#0F172A]',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{CATEGORY_LABELS[key]}</span>
                {key === value && <Check size={15} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ComparisonSummaryCard({ navigate, detail }) {
  const [reviewItem, setReviewItem] = useState(null)
  const [reviewError, setReviewError] = useState(null)
  const result = detail.result
  const summary = summarizeComparison(result)

  useEffect(() => {
    if (result?.status === 'NEEDS_REVIEW') {
      setReviewError(null)
      getReviewItems({ email_id: detail.email_id, status: 'open' })
        .then((data) => setReviewItem(data.items?.[0] || null))
        .catch(setReviewError)
    } else {
      setReviewItem(null)
    }
  }, [detail.email_id, result?.status])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-[#1E293B]">Document comparison</h2>
      <p
        className={cn(
          'mt-2 text-sm font-medium',
          summary.tone === 'mismatch'
            ? 'text-[#B91C1C]'
            : summary.tone === 'review'
              ? 'text-[#B45309]'
              : 'text-[#047857]',
        )}
      >
        {summary.text}
      </p>
      {result?.status === 'NEEDS_REVIEW' && reviewItem ? (
        <button
          type="button"
          onClick={() => navigate(`/review/${reviewItem.id}`)}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white hover:bg-[#1E293B]"
        >
          Open in Review queue
        </button>
      ) : (
        <button
          type="button"
          onClick={() => navigate(`/docs-comparison/${detail.email_id}`)}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white hover:bg-[#1E293B]"
        >
          Open in Docs Comparison
        </button>
      )}
      {reviewError && <BackendError error={reviewError} compact />}
    </section>
  )
}

function AttachmentRow({ attachment }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-[#E2E8F0]">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0 truncate font-mono text-sm text-[#1E293B]">
          {attachment.filename}
        </span>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9]"
          >
            <ArrowSquareOut size={14} />
            {expanded ? 'Hide' : 'View'}
          </button>
          <a
            href={attachmentUrl(attachment.path)}
            download
            className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9]"
          >
            <DownloadSimple size={14} />
            Download
          </a>
        </div>
      </div>
      {expanded && (
        <div className="h-[360px] border-t border-[#E2E8F0] p-3">
          <DocumentViewer path={attachment.path} location={null} />
        </div>
      )}
    </div>
  )
}

export function InboxDetailPage({ navigate, emailId }) {
  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pendingCategory, setPendingCategory] = useState('')
  const [error, setError] = useState(null)

  function load() {
    setError(null)
    getEmail(emailId)
      .then((data) => {
        setDetail(data)
        setPendingCategory(data.category_override || data.category || '')
      })
      .catch(setError)
  }

  useEffect(load, [emailId])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [emailId])

  async function applyOverride(category) {
    setSaving(true)
    setError(null)
    try {
      await overrideCategory(emailId, { category })
      notifyDataChanged()
      load()
    } catch (reason) {
      setError(reason)
    } finally {
      setSaving(false)
    }
  }

  if (error && !detail) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10 lg:px-14">
        <BackendError error={error} onRetry={load} />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="p-8 lg:p-12">
        <div className="h-8 w-64 animate-pulse rounded bg-[#E2E8F0]" />
      </div>
    )
  }

  const isOverridden = Boolean(detail.category_override)
  const hasPendingChange = Boolean(pendingCategory) && pendingCategory !== detail.category

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-14">
      <button
        type="button"
        onClick={() => navigate('/inbox')}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-lg border border-[#0F172A] bg-transparent px-4 text-sm font-semibold text-[#0F172A] hover:bg-white/60"
      >
        <ArrowLeft size={16} />
        Inbox
      </button>

      <div className="flex flex-wrap items-center gap-3 text-sm text-[#475569]">
        <span className="font-mono">{detail.display_id}</span>
        <CategoryBadge category={detail.category} />
        {isOverridden && (
          <span className="text-xs text-[#475569]">
            Originally classified as{' '}
            {CATEGORY_LABELS[detail.category_machine] || detail.category_machine}
          </span>
        )}
      </div>
      <h1 className="mt-3 text-4xl font-semibold text-[#0F172A]">{detail.subject}</h1>
      <p className="mt-2 text-sm text-[#475569]">
        From {detail.sender} · Received {formatDate(detail.received_at)}
      </p>
      <p className="mt-1 text-xs text-[#475569]">
        Classified by {detail.classification_method === 'llm' ? 'LLM fallback' : 'rules'}
        {detail.classification_reason ? ` — ${detail.classification_reason}` : ''}
      </p>
      {error && (
        <div className="mt-5">
          <BackendError error={error} compact />
        </div>
      )}

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-[#1E293B]">Message</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#475569]">{detail.body}</p>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-[#1E293B]">Change Category</h2>
            <p className="mt-1 text-xs text-[#64748B]">
              Change this category if this email was classified incorrectly.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <CategoryPicker
                value={pendingCategory}
                onChange={setPendingCategory}
                disabled={saving}
              />
              <button
                type="button"
                disabled={saving || !hasPendingChange}
                onClick={() => applyOverride(pendingCategory)}
                className="inline-flex h-10 items-center rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:bg-[#E2E8F0] disabled:text-[#94A3B8] disabled:shadow-none"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
            {saving && <p className="mt-2 text-xs text-[#64748B]">Applying and recomputing…</p>}
            {isOverridden && !saving && (
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-[#0F172A] underline"
                onClick={() => applyOverride(null)}
              >
                Revert to {CATEGORY_LABELS[detail.category_machine] || detail.category_machine}
              </button>
            )}
          </section>

          {detail.category === 'BL_COMPARISON' && (
            <ComparisonSummaryCard navigate={navigate} detail={detail} />
          )}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h2 className="text-lg font-semibold text-[#1E293B]">
            Attachments ({detail.attachments?.length || 0})
          </h2>
          <div className="mt-3 space-y-2">
            {(detail.attachments || []).map((attachment) => (
              <AttachmentRow key={attachment.path} attachment={attachment} />
            ))}
            {!detail.attachments?.length && (
              <p className="text-sm text-[#64748B]">No attachments on this email.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
