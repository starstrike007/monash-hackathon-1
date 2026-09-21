import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CaretDown,
  Check,
  CheckCircle,
  EnvelopeSimple,
  Flag,
  Warning,
  XCircle,
} from '@phosphor-icons/react'

import { DocumentViewer } from '@/components/document-viewer/DocumentViewer'
import { BackendError } from '@/components/BackendError'
import { CategoryBadge } from '@/components/layout/StatusBadge'
import { LoadingBoat } from '@/components/LoadingBoat'
import { fieldLabels, summarizeComparison } from '@/features/docs-comparison/summary'
import {
  escalateToHumanReview,
  getEmail,
  getReviewItems,
  notifyDataChanged,
  overrideComparisonResult,
} from '@/lib/api'
import { formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

const BANNER_TONE = {
  ok: 'bg-[#D1FAE5] text-emerald-700 border-[#A7F3D0]',
  mismatch: 'bg-[#FEE2E2] text-red-700 border-[#FECACA]',
  review: 'bg-[#FEF3C7] text-amber-700 border-[#FDE68A]',
}

// Same look as the "Why this needs a human review" banner: a plain outline icon and a
// font-display semibold title in a darker shade of the banner colour.
const BANNER_TITLE = {
  ok: 'text-emerald-900',
  mismatch: 'text-red-900',
  review: 'text-[#78350F]',
}

const BANNER_ICONS = {
  ok: CheckCircle,
  mismatch: XCircle,
  review: Warning,
}

function ResultBanner({ tone, text, children }) {
  const BannerIcon = BANNER_ICONS[tone] || Warning

  return (
    <div className={cn('w-full rounded-2xl border px-5 py-2.5', BANNER_TONE[tone])}>
      <div className="flex items-center gap-4">
        <BannerIcon size={22} className="shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className={cn('font-display font-semibold', BANNER_TITLE[tone])}>{text}</p>
          {children}
        </div>
      </div>
    </div>
  )
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
      <p className="text-[13.5px] text-[#1E293B]">
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
              <div className="relative">
                <select
                  aria-label={`Result for ${field.label}`}
                  value={pendingResult}
                  disabled={savingField === comparison.field_name}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => onChangeResult(comparison.field_name, event.target.value)}
                  className={cn(
                    'h-9 appearance-none rounded-md border bg-white pl-2 pr-7 text-xs font-semibold text-[#1E293B] outline-none focus:ring-2 focus:ring-[#0E5A66]/20',
                    mismatch && 'border-[#FECACA] text-[#B91C1C]',
                    uncertain && 'border-[#FDE68A] text-[#B45309]',
                    !mismatch && !uncertain && 'border-[#A7F3D0] text-[#047857]',
                  )}
                >
                  <option value="match">Match</option>
                  <option value="mismatch">Mismatch</option>
                  <option value="skipped">Uncertain</option>
                </select>
                <CaretDown
                  size={13}
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B]"
                />
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onSaveResult(comparison.field_name)
                }}
                disabled={!hasChanges || savingField === comparison.field_name}
                className="inline-flex h-9 items-center gap-1 rounded-md bg-[#0F172A] px-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#E6EEFC] disabled:text-[#94A3B8]"
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
  const [openReviewItem, setOpenReviewItem] = useState(null)
  const [escalating, setEscalating] = useState(false)
  const [escalateError, setEscalateError] = useState(null)

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [emailId])

  useEffect(() => {
    setError(null)
    setResultSaveError(null)
    setPendingResults({})
    getEmail(emailId)
      .then((data) => {
        setDetail(data)
        const comparisons = data.result?.comparisons || []
        setPendingResults(
          Object.fromEntries(
            comparisons.map((comparison) => [comparison.field_name, comparison.result]),
          ),
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

  // Any open human-review item for this email (from the pipeline or an escalation).
  useEffect(() => {
    setEscalateError(null)
    getReviewItems({ email_id: emailId, status: 'open' })
      .then((data) => setOpenReviewItem(data.items?.[0] || null))
      .catch(setEscalateError)
  }, [emailId, detail?.result?.status, detail?.result?.version])

  async function escalate() {
    setEscalating(true)
    setEscalateError(null)
    try {
      setOpenReviewItem(await escalateToHumanReview(emailId))
      notifyDataChanged()
    } catch (reason) {
      setEscalateError(reason)
    } finally {
      setEscalating(false)
    }
  }

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
  const hasReviewAndMismatch = result?.status === 'NEEDS_REVIEW' && Boolean(summary.secondaryText)
  const reviewBannerText = hasReviewAndMismatch
    ? `Needs review: ${summary.primaryText || 'Unresolved'}`
    : summary.text

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
        Object.fromEntries(refreshedComparisons.map((item) => [item.field_name, item.result])),
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
        <LoadingBoat label="Loading comparison" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-14">
      <button
        type="button"
        onClick={() => navigate('/docs-comparison')}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-lg border border-[#B4C8EC] bg-[#E6EEFC] px-4 text-sm font-semibold text-[#0F172A] hover:bg-[#D6E3FA]"
      >
        <ArrowLeft size={16} />
        Document comparison
      </button>

      <header className="flex flex-wrap items-center gap-3 text-sm font-medium text-[#475569]">
        <span className="font-mono text-[#475569]">{detail.display_id}</span>
        <CategoryBadge category={result?.category} />
      </header>
      <h1 className="font-display mt-3 text-[1.625rem] font-semibold tracking-[-0.02em] text-[#0F172A] sm:text-[2rem]">
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

      <div className="mt-7 space-y-3">
        <ResultBanner tone={hasReviewAndMismatch ? 'review' : summary.tone} text={reviewBannerText}>
          {result?.status === 'NEEDS_REVIEW' && reviewItem && (
            <button
              type="button"
              onClick={() => navigate(`/review/${reviewItem.id}`)}
              className="mb-1 mt-1.5 inline-flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-semibold underline"
            >
              Go to human review
            </button>
          )}
        </ResultBanner>
        {hasReviewAndMismatch && <ResultBanner tone="mismatch" text={summary.secondaryText} />}
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
        {result && (
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-display text-lg font-semibold text-[#1E293B]">
                Escalate to human review
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#64748B]">
                {openReviewItem
                  ? 'This email is already in the human review list, where a person will check it against both documents.'
                  : 'Not confident in this result? Escalate it and a person will check each field against both documents. The email stays in the human review list until someone marks it as reviewed.'}
              </p>
              {escalateError && (
                <div className="mt-3">
                  <BackendError error={escalateError} compact />
                </div>
              )}
            </div>
            {openReviewItem ? (
              <button
                type="button"
                onClick={() => navigate(`/review/${openReviewItem.id}`)}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#B4C8EC] bg-[#E6EEFC] px-4 text-sm font-semibold text-[#0F172A] hover:bg-[#D6E3FA]"
              >
                Go to human review
              </button>
            ) : (
              <button
                type="button"
                onClick={escalate}
                disabled={escalating}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1E293B] disabled:opacity-60"
              >
                <Flag size={17} aria-hidden="true" />
                {escalating ? 'Escalating…' : 'Escalate to human review'}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
