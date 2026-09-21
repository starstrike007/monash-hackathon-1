import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CaretDown } from '@phosphor-icons/react'

import { DocumentViewer } from '@/components/document-viewer/DocumentViewer'
import { CategoryBadge, StatusBadge } from '@/components/layout/StatusBadge'
import { fieldLabels, summarizeComparison } from '@/features/docs-comparison/summary'
import { getEmail, getReviewItems } from '@/lib/api'
import { formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

const BANNER_TONE = {
  ok: 'bg-[#E2F1E8] text-[#17693F] border-[#BFE0CC]',
  mismatch: 'bg-[#F8E3E0] text-[#A32720] border-[#F2C2BC]',
  review: 'bg-[#FBEBCF] text-[#8A5300] border-[#EFD9A6]',
}

function ValueCell({ extraction }) {
  if (!extraction || extraction.state !== 'found') {
    return <p className="text-sm italic text-[#9AA4A8]">{extraction?.state || 'missing'}</p>
  }
  return (
    <div>
      <p className="text-[15px] text-[#26353D]">{extraction.raw_value || '—'}</p>
      {extraction.normalized_value && extraction.normalized_value !== extraction.raw_value && (
        <p className="mt-1 font-mono text-xs text-[#71808A]">{extraction.normalized_value}</p>
      )}
    </div>
  )
}

function ComparisonTable({ comparisons, activeField, onSelectField }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E3DED1] bg-white">
      <div className="grid grid-cols-[1.1fr_1.3fr_1.3fr_110px] gap-4 bg-[#FBF9F4] px-6 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#71808A]">
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
              'grid w-full grid-cols-[1.1fr_1.3fr_1.3fr_110px] gap-4 border-t border-[#E9E5D9] px-6 py-4 text-left transition-colors hover:bg-[#FCFAF4]',
              mismatch && 'bg-[#FEF0EE]',
              uncertain && 'bg-[#FFF8E9]',
              active && 'ring-2 ring-inset ring-[#0E5A66]',
            )}
          >
            <p
              className={cn(
                'font-semibold',
                mismatch ? 'text-[#8C2A24]' : uncertain ? 'text-[#8A5300]' : 'text-[#26353D]',
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
                <span className="inline-flex items-center rounded-full bg-[#FBEBCF] px-3 py-1 text-xs font-semibold text-[#8A5300]">
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
    <section className="overflow-hidden rounded-2xl border border-[#E3DED1] bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-[#26353D]">How this was decided</span>
        <CaretDown
          size={16}
          className={cn('text-[#71808A] transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="border-t border-[#E9E5D9] px-6 py-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[#8A7F68]">
                <th className="py-1 pr-4">Field</th>
                <th className="py-1 pr-4">SI source</th>
                <th className="py-1 pr-4">BL source</th>
                <th className="py-1">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((comparison) => (
                <tr key={comparison.field_name} className="border-t border-[#F0ECE0]">
                  <td className="py-2 pr-4 text-[#26353D]">
                    {fieldLabels[comparison.field_name]?.label || comparison.field_name}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-[#71808A]">
                    {comparison.si?.source || '—'}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-[#71808A]">
                    {comparison.bl?.source || '—'}
                  </td>
                  <td className="py-2 text-[#71808A]">{comparison.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result?.skipped_fields?.length > 0 && (
            <p className="mt-3 text-xs text-[#8A5300]">
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

  useEffect(() => {
    getEmail(emailId).then((data) => {
      setDetail(data)
      const comparisons = data.result?.comparisons || []
      const firstMismatch = comparisons.find((item) => item.result === 'mismatch')
      setActiveField((firstMismatch || comparisons[0])?.field_name || null)
    })
  }, [emailId])

  useEffect(() => {
    if (detail?.result?.status === 'NEEDS_REVIEW') {
      getReviewItems({ email_id: emailId, status: 'open' }).then((data) =>
        setReviewItem(data.items?.[0] || null),
      )
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
  const siDoc = result?.documents?.find((document) => document.role === 'SI')
  const blDoc = result?.documents?.find((document) => document.role === 'BL')
  const summary = summarizeComparison(result)

  if (!detail) {
    return (
      <div className="p-8 lg:p-12">
        <div className="h-8 w-64 animate-pulse rounded bg-[#E9E5D9]" />
        <div className="mt-8 h-80 animate-pulse rounded-2xl bg-white" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-14">
      <button
        type="button"
        onClick={() => navigate('/docs-comparison')}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#26353D] shadow-sm"
      >
        <ArrowLeft size={16} />
        Docs Comparison
      </button>

      <header className="flex flex-wrap items-center gap-3 text-sm font-medium text-[#0E5A66]">
        <span className="font-mono text-[#71808A]">{detail.display_id}</span>
        <StatusBadge status={result?.status} />
        <CategoryBadge category={result?.category} />
      </header>
      <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight text-[#16232B] sm:text-5xl">
        {detail.subject}
      </h1>
      <p className="mt-3 text-sm text-[#71808A]">
        From {detail.sender} · Received {formatDate(detail.received_at)}
      </p>

      <div className={cn('mt-7 rounded-2xl border p-6', BANNER_TONE[summary.tone])}>
        <p className="font-serif text-2xl font-semibold">{summary.text}</p>
        {result?.status === 'NEEDS_REVIEW' && reviewItem && (
          <button
            type="button"
            onClick={() => navigate(`/review/${reviewItem.id}`)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-sm font-semibold underline"
          >
            Open in Review queue
          </button>
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 xl:gap-4">
          <div className="h-[420px]">
            <DocumentViewer
              path={siDoc?.path}
              label="Shipping instruction"
              location={activeComparison?.si?.evidence}
            />
          </div>
          <div className="h-[420px]">
            <DocumentViewer
              path={blDoc?.path}
              label="Draft bill of lading"
              location={activeComparison?.bl?.evidence}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
