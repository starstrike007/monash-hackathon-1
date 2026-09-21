import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, EnvelopeSimple } from '@phosphor-icons/react'

import { DocumentViewer } from '@/components/document-viewer/DocumentViewer'
import { BackendError } from '@/components/BackendError'
import { CategoryBadge } from '@/components/layout/StatusBadge'
import { fieldLabels, summarizeComparison } from '@/features/docs-comparison/summary'
import { getEmail, getReviewItems, notifyDataChanged, overrideComparisonResult } from '@/lib/api'
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

function ComparisonTable({
  comparisons,
  pendingResults,
  savingField,
  onSelectField,
  onChangeResult,
  onSaveResult,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
      <div className="grid grid-cols-[1.1fr_1.3fr_1.3fr_170px] gap-4 bg-[#F8FAFC] px-6 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">
        <span>Field</span>
        <span>Shipping instruction</span>
        <span>Draft bill of lading</span>
        <span>Result</span>
      </div>
      {comparisons.map((comparison) => {
        const field = fieldLabels[comparison.field_name] || { label: comparison.field_name }
        const pendingResult = pendingResults[comparison.field_name] || comparison.result
        const mismatch = pendingResult === 'mismatch'
        const uncertain = pendingResult === 'skipped'
        const hasChanges = pendingResult !== comparison.result
        return (
          <div
            key={comparison.field_name}
            role="button"
            tabIndex={0}
            onClick={() => onSelectField(comparison.field_name)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelectField(comparison.field_name)
              }
            }}
            className={cn(
              'grid w-full grid-cols-[1.1fr_1.3fr_1.3fr_170px] gap-4 border-t border-[#E2E8F0] px-6 py-4 text-left transition-colors hover:bg-[#F8FAFC]',
              mismatch && 'bg-[#FEF2F2]',
              uncertain && 'bg-[#FFFBEB]',
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
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Result for ${field.label}`}
                value={pendingResult}
                disabled={savingField === comparison.field_name}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onChangeResult(comparison.field_name, event.target.value)}
                className={cn(
                  'h-9 rounded-md border bg-white px-2 text-xs font-semibold text-[#1E293B] outline-none focus:ring-2 focus:ring-[#0E5A66]/20',
                  mismatch && 'border-[#FECACA] text-[#B91C1C]',
                  uncertain && 'border-[#FDE68A] text-[#B45309]',
                  !mismatch && !uncertain && 'border-[#A7F3D0] text-[#047857]',
                )}
              >
                <option value="match">Match</option>
                <option value="mismatch">Mismatch</option>
                <option value="skipped">Uncertain</option>
              </select>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onSaveResult(comparison.field_name)
                }}
                disabled={!hasChanges || savingField === comparison.field_name}
                className="inline-flex h-9 items-center gap-1 rounded-md bg-[#0F172A] px-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#E2E8F0] disabled:text-[#94A3B8]"
              >
                <Check size={14} aria-hidden="true" />
                {savingField === comparison.field_name ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function DocsComparisonDetailPage({ navigate, emailId }) {
  const [detail, setDetail] = useState(null)
  const [reviewItem, setReviewItem] = useState(null)
  const [activeField, setActiveField] = useState(null)
  const [error, setError] = useState(null)
  const [reviewError, setReviewError] = useState(null)
  const [pendingResults, setPendingResults] = useState({})
  const [savingField, setSavingField] = useState(null)
  const [resultSaveError, setResultSaveError] = useState(null)

  useEffect(() => {
    setError(null)
    setResultSaveError(null)
    setPendingResults({})
    getEmail(emailId)
      .then((data) => {
        setDetail(data)
        const comparisons = data.result?.comparisons || []
        setPendingResults(
          Object.fromEntries(comparisons.map((comparison) => [comparison.field_name, comparison.result])),
        )
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
  const activeMismatch = activeComparison?.result === 'mismatch' ? activeComparison : null
  const documents = result?.documents || []
  const siDoc = documents.find((document) => document.role === 'SI') || documents[0]
  const blDoc = documents.find((document) => document.role === 'BL') || documents[1]
  const summary = summarizeComparison(result)

  function handleResultChange(fieldName, value) {
    setPendingResults((current) => ({ ...current, [fieldName]: value }))
    setResultSaveError(null)
  }

  async function saveResultOverride(fieldName) {
    const comparison = comparisons.find((item) => item.field_name === fieldName)
    const nextResult = pendingResults[fieldName] || comparison?.result
    if (!comparison || !nextResult || nextResult === comparison.result) return

    setSavingField(fieldName)
    setResultSaveError(null)
    try {
      await overrideComparisonResult(emailId, {
        field_name: fieldName,
        result: nextResult,
        reviewer_id: 'local-reviewer',
        expected_version: result?.version,
      })
      const refreshed = await getEmail(emailId)
      const refreshedComparisons = refreshed.result?.comparisons || []
      setDetail(refreshed)
      setPendingResults(
        Object.fromEntries(
          refreshedComparisons.map((item) => [item.field_name, item.result]),
        ),
      )
      setActiveField(fieldName)
      if (refreshed.result?.status === 'NEEDS_REVIEW') {
        getReviewItems({ email_id: emailId, status: 'open' })
          .then((data) => setReviewItem(data.items?.[0] || null))
          .catch(setReviewError)
      } else {
        setReviewItem(null)
      }
      notifyDataChanged()
    } catch (reason) {
      setResultSaveError(reason)
    } finally {
      setSavingField(null)
    }
  }

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
        Document Comparison
      </button>

      <header className="flex flex-wrap items-center gap-3 text-sm font-medium text-[#475569]">
        <span className="font-mono text-[#475569]">{detail.display_id}</span>
        <CategoryBadge category={result?.category} />
      </header>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0F172A] sm:text-4xl">
        {detail.subject}
      </h1>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#475569]">
          From {detail.sender} · Received {formatDate(detail.received_at)}
        </p>
        <button
          type="button"
          onClick={() => navigate(`/inbox/${emailId}`)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1E293B]"
        >
          <EnvelopeSimple size={17} aria-hidden="true" />
          Go to email content
        </button>
      </div>

      <div className={cn('mt-7 rounded-2xl border px-6 py-3', BANNER_TONE[summary.tone])}>
        <p className="text-2xl font-semibold">{summary.text}</p>
        {result?.status === 'NEEDS_REVIEW' && reviewItem && (
          <button
            type="button"
            onClick={() => navigate(`/review/${reviewItem.id}`)}
            className="mb-1 mt-2 inline-flex items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-sm font-semibold underline"
          >
            Open in Review queue
          </button>
        )}
        {reviewError && (
          <div className="mt-3">
            <BackendError error={reviewError} compact />
          </div>
        )}
        {resultSaveError && (
          <div className="mt-3">
            <BackendError error={resultSaveError} compact />
          </div>
        )}
      </div>

      <div className="mt-7 space-y-7">
        <ComparisonTable
          comparisons={comparisons}
          pendingResults={pendingResults}
          savingField={savingField}
          onSelectField={setActiveField}
          onChangeResult={handleResultChange}
          onSaveResult={saveResultOverride}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-[520px]">
            <DocumentViewer
              path={siDoc?.path}
              label="Shipping instruction"
              location={activeMismatch?.si?.evidence}
              tone={activeMismatch ? 'mismatch' : 'review'}
              readable={siDoc?.readable}
            />
          </div>
          <div className="h-[520px]">
            <DocumentViewer
              path={blDoc?.path}
              label="Draft bill of lading"
              location={activeMismatch?.bl?.evidence}
              tone={activeMismatch ? 'mismatch' : 'review'}
              readable={blDoc?.readable}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
