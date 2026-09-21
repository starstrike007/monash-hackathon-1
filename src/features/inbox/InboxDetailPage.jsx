import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowSquareOut, DownloadSimple } from '@phosphor-icons/react'

import { DocumentViewer } from '@/components/document-viewer/DocumentViewer'
import { CategoryBadge } from '@/components/layout/StatusBadge'
import { summarizeComparison } from '@/features/docs-comparison/summary'
import { attachmentUrl, getEmail, getReviewItems, overrideCategory } from '@/lib/api'
import { CATEGORY_LABELS, formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS)

function ComparisonSummaryCard({ navigate, detail }) {
  const [reviewItem, setReviewItem] = useState(null)
  const result = detail.result
  const summary = summarizeComparison(result)

  useEffect(() => {
    if (result?.status === 'NEEDS_REVIEW') {
      getReviewItems({ email_id: detail.email_id, status: 'open' }).then((data) =>
        setReviewItem(data.items?.[0] || null),
      )
    }
  }, [detail.email_id, result?.status])

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[#26353D]">Document comparison</h2>
      <p
        className={cn(
          'mt-2 text-sm font-medium',
          summary.tone === 'mismatch'
            ? 'text-[#A32720]'
            : summary.tone === 'review'
              ? 'text-[#8A5300]'
              : 'text-[#17693F]',
        )}
      >
        {summary.text}
      </p>
      {result?.status === 'NEEDS_REVIEW' && reviewItem ? (
        <button
          type="button"
          onClick={() => navigate(`/review/${reviewItem.id}`)}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[#0E5A66] px-4 text-sm font-semibold text-white"
        >
          Open in Review queue
        </button>
      ) : (
        <button
          type="button"
          onClick={() => navigate(`/docs-comparison/${detail.email_id}`)}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[#0E5A66] px-4 text-sm font-semibold text-white"
        >
          Open in Docs Comparison
        </button>
      )}
    </section>
  )
}

function AttachmentRow({ attachment }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-[#E9E5D9]">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0 truncate font-mono text-sm text-[#26353D]">
          {attachment.filename}
        </span>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold text-[#0E5A66] hover:bg-[#E6F0F1]"
          >
            <ArrowSquareOut size={14} />
            {expanded ? 'Hide' : 'View'}
          </button>
          <a
            href={attachmentUrl(attachment.path)}
            download
            className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold text-[#0E5A66] hover:bg-[#E6F0F1]"
          >
            <DownloadSimple size={14} />
            Download
          </a>
        </div>
      </div>
      {expanded && (
        <div className="h-[360px] border-t border-[#E9E5D9] p-3">
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

  function load() {
    getEmail(emailId).then((data) => {
      setDetail(data)
      setPendingCategory(data.category_override || data.category || '')
    })
  }

  useEffect(load, [emailId])

  async function applyOverride(category) {
    setSaving(true)
    await overrideCategory(emailId, { category })
    setSaving(false)
    load()
  }

  if (!detail) {
    return (
      <div className="p-8 lg:p-12">
        <div className="h-8 w-64 animate-pulse rounded bg-[#E9E5D9]" />
      </div>
    )
  }

  const isOverridden = Boolean(detail.category_override)

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10 lg:px-14">
      <button
        type="button"
        onClick={() => navigate('/inbox')}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#26353D] shadow-sm"
      >
        <ArrowLeft size={16} />
        Inbox
      </button>

      <div className="flex flex-wrap items-center gap-3 text-sm text-[#71808A]">
        <span className="font-mono">{detail.display_id}</span>
        <CategoryBadge category={detail.category} />
        {isOverridden && (
          <span className="text-xs text-[#8A7F68]">
            Originally classified as{' '}
            {CATEGORY_LABELS[detail.category_machine] || detail.category_machine}
          </span>
        )}
      </div>
      <h1 className="mt-3 font-serif text-4xl font-semibold text-[#16232B]">{detail.subject}</h1>
      <p className="mt-2 text-sm text-[#71808A]">
        From {detail.sender} · Received {formatDate(detail.received_at)}
      </p>
      <p className="mt-1 text-xs text-[#8A7F68]">
        Classified by {detail.classification_method === 'llm' ? 'LLM fallback' : 'rules'}
        {detail.classification_reason ? ` — ${detail.classification_reason}` : ''}
      </p>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#26353D]">Message</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#3A464C]">
              {detail.body}
            </p>
          </section>
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#26353D]">
              Attachments ({detail.attachments?.length || 0})
            </h2>
            <div className="mt-3 space-y-2">
              {(detail.attachments || []).map((attachment) => (
                <AttachmentRow key={attachment.path} attachment={attachment} />
              ))}
              {!detail.attachments?.length && (
                <p className="text-sm text-[#71808A]">No attachments on this email.</p>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#26353D]">Category</h2>
            <select
              className="mt-3 h-11 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 text-sm"
              value={pendingCategory}
              disabled={saving}
              onChange={(event) => {
                setPendingCategory(event.target.value)
                applyOverride(event.target.value)
              }}
            >
              {CATEGORY_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
            {saving && <p className="mt-2 text-xs text-[#71808A]">Applying and recomputing…</p>}
            {isOverridden && !saving && (
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-[#0E5A66] underline"
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
      </div>
    </div>
  )
}
