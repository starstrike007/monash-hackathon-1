import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CaretDown } from '@phosphor-icons/react'

import { DocumentViewer } from '@/components/document-viewer/DocumentViewer'
import { BackendError } from '@/components/BackendError'
import { CategoryBadge, StatusBadge } from '@/components/layout/StatusBadge'
import { fieldLabels, summarizeComparison } from '@/features/docs-comparison/summary'
import { getEmail, getReviewItems } from '@/lib/api'
import { formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

const BANNER_TONE = {
  ok: 'bg-[#D1FAE5] text-emerald-700 border-[#A7F3D0]',
  mismatch: 'bg-[#FEE2E2] text-red-700 border-[#FECACA]',
  review: 'bg-[#FEF3C7] text-amber-700 border-[#FDE68A]',
}

function ValueCell({ extraction }) {
  if (!extraction || extraction.state !== 'found') {
    return <p className="text-sm italic text-[#94A3B8]">{extraction?.state || 'missing'}</p>
  }
  return (
    <div>
      <p className="font-mono text-xs text-[#64748B]">
        <span className="mr-1 font-sans uppercase tracking-wide text-[#94A3B8]">Normalized</span>
        {extraction.normalized_value || '—'}
      </p>
      <p className="text-[15px] text-[#1E293B]">
        <span className="mr-1 text-xs uppercase tracking-wide text-[#94A3B8]">Raw</span>
        {extraction.raw_value || '—'}
      </p>
    </div>
  )
}

function ComparisonTable({ comparisons, activeField, onSelectField }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
      <div className="grid grid-cols-[1.1fr_1.3fr_1.3fr_110px] gap-4 bg-[#F8FAFC] px-6 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">
        <span>Field</span>
        <span>Shipping instruction</span>
        <span>Draft bill of lading</span>
        <span>Result</span>
      </div>
      {comparisons.map((comparison) => {
        const field = fieldLabels[comparison.field_name] || { label: comparison.field_name }
        const mismatch = comparison.result === 'mismatch'
        const uncertain = comparison.result === 'skipped'
        const active = comparison.field_name === activeField
        return (
          <button
            key={comparison.field_name}
            onClick={() => onSelectField(comparison.field_name)}
            className={cn(
              'grid w-full grid-cols-[1.1fr_1.3fr_1.3fr_110px] gap-4 border-t border-[#E2E8F0] px-6 py-4 text-left transition-colors hover:bg-[#F8FAFC]',
              mismatch && 'bg-[#FEF2F2]',
              uncertain && 'bg-[#FFFBEB]',
              active && 'ring-2 ring-inset ring-[#0F172A]',
            )}
          >
            <p
              className={cn(
                'font-semibold',
                mismatch ? 'text-[#991B1B]' : uncertain ? 'text-[#B45309]' : 'text-[#1E293B]',
              )}
            >
              {field.label}
            </p>
            <ValueCell extraction={comparison.si} />
            <ValueCell extraction={comparison.bl} />
            <div>
              {mismatch ? (
                <StatusBadge status="MISMATCH" />
              ) : uncertain ? (
                <span className="inline-flex items-center rounded-md bg-[#FEF3C7] px-2 py-1 font-mono text-xs font-medium text-amber-700">
                  Uncertain
                </span>
              ) : (
                <StatusBadge status="OK" />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function DecisionSection({ result }) {
  const [open, setOpen] = useState(false)
  const comparisons = result?.comparisons || []
  return (
    <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-[#1E293B]">How this was decided</span>
        <CaretDown
          size={16}
          className={cn('text-[#64748B] transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="border-t border-[#E2E8F0] px-6 py-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[#64748B]">
                <th className="py-1 pr-4">Field</th>
                <th className="py-1 pr-4">SI source</th>
                <th className="py-1 pr-4">BL source</th>
                <th className="py-1">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((comparison) => (
                <tr key={comparison.field_name} className="border-t border-[#E2E8F0]">
                  <td className="py-2 pr-4 text-[#1E293B]">
                    {fieldLabels[comparison.field_name]?.label || comparison.field_name}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-[#64748B]">
                    {comparison.si?.source || '—'}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-[#64748B]">
                    {comparison.bl?.source || '—'}
                  </td>
                  <td className="py-2 text-[#64748B]">{comparison.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result?.skipped_fields?.length > 0 && (
            <p className="mt-3 text-xs text-[#B45309]">
              Skipped:{' '}
              {result.skipped_fields.map((key) => fieldLabels[key]?.label || key).join(', ')}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export function DocsComparisonDetailPage({ navigate, emailId }) {
  const [detail, setDetail] = useState(null)
  const [reviewItem, setReviewItem] = useState(null)
  const [activeField, setActiveField] = useState(null)
  const [error, setError] = useState(null)
  const [reviewError, setReviewError] = useState(null)

  useEffect(() => {
    setError(null)
    getEmail(emailId)
      .then((data) => {
        setDetail(data)
        const comparisons = data.result?.comparisons || []
        const firstMismatch = comparisons.find((item) => item.result === 'mismatch')
        setActiveField((firstMismatch || comparisons[0])?.field_name || null)
      })
      .catch(setError)
  }, [emailId])

  useEffect(() => {
    if (detail?.result?.status === 'NEEDS_REVIEW') {
      setReviewError(null)
      getReviewItems({ email_id: emailId, status: 'open' })
        .then((data) => setReviewItem(data.items?.[0] || null))
        .catch(setReviewError)
    } else {
      setReviewItem(null)
    }
  }, [emailId, detail?.result?.status])

  const result = detail?.result
  const comparisons = result?.comparisons || []
  const activeComparison = useMemo(
    () => comparisons.find((item) => item.field_name === activeField) || null,
    [comparisons, activeField],
  )
  const documents = result?.documents || []
  const siDoc = documents.find((document) => document.role === 'SI') || documents[0]
  const blDoc = documents.find((document) => document.role === 'BL') || documents[1]
  const summary = summarizeComparison(result)

  if (error && !detail) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10 lg:px-14">
        <BackendError error={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="p-8 lg:p-12">
        <div className="h-8 w-64 animate-pulse rounded bg-[#E2E8F0]" />
        <div className="mt-8 h-80 animate-pulse rounded-2xl bg-white" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-14">
      <button
        type="button"
        onClick={() => navigate('/docs-comparison')}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-lg border border-[#0F172A] bg-transparent px-4 text-sm font-semibold text-[#0F172A] hover:bg-white/60"
      >
        <ArrowLeft size={16} />
        Docs Comparison
      </button>

      <header className="flex flex-wrap items-center gap-3 text-sm font-medium text-[#475569]">
        <span className="font-mono text-[#475569]">{detail.display_id}</span>
        <StatusBadge status={result?.status} />
        <CategoryBadge category={result?.category} />
      </header>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#0F172A] sm:text-5xl">
        {detail.subject}
      </h1>
      <p className="mt-3 text-sm text-[#475569]">
        From {detail.sender} · Received {formatDate(detail.received_at)}
      </p>

      <div className={cn('mt-7 rounded-2xl border p-6', BANNER_TONE[summary.tone])}>
        <p className="text-2xl font-semibold">{summary.text}</p>
        {result?.status === 'NEEDS_REVIEW' && reviewItem && (
          <button
            type="button"
            onClick={() => navigate(`/review/${reviewItem.id}`)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-sm font-semibold underline"
          >
            Open in Review queue
          </button>
        )}
        {reviewError && (
          <div className="mt-3">
            <BackendError error={reviewError} compact />
          </div>
        )}
      </div>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-7">
          <ComparisonTable
            comparisons={comparisons}
            activeField={activeField}
            onSelectField={setActiveField}
          />
          <DecisionSection result={result} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2 xl:gap-4">
          <div className="h-[520px]">
            <DocumentViewer
              path={siDoc?.path}
              label="Shipping instruction"
              location={activeComparison?.si?.evidence}
              tone={activeComparison?.result === 'mismatch' ? 'mismatch' : 'review'}
              readable={siDoc?.readable}
            />
          </div>
          <div className="h-[520px]">
            <DocumentViewer
              path={blDoc?.path}
              label="Draft bill of lading"
              location={activeComparison?.bl?.evidence}
              tone={activeComparison?.result === 'mismatch' ? 'mismatch' : 'review'}
              readable={blDoc?.readable}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
