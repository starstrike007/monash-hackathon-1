import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Clipboard, FloppyDisk, Warning, X } from '@phosphor-icons/react'

import { CategoryBadge, StatusBadge } from '@/components/layout/StatusBadge'
import { attachmentUrl, getEmail, resolveEmail, retryEmail } from '@/lib/api'
import { FIELDS, STATUS } from '@/lib/types'
import { cn } from '@/lib/utils'

const fieldLabels = Object.fromEntries(FIELDS.map((field) => [field.key, field]))

function ValueCell({ value, side }) {
  if (!value) return <div className="text-sm text-[#9AA4A8]">Not found</div>
  return (
    <div>
      <p className={cn('text-[15px] text-[#26353D]', side === 'bl' && 'font-medium')}>
        {value.raw_value || value.normalized_value || '—'}
      </p>
      <p className="mt-1 font-mono text-xs text-[#71808A]">
        {value.normalized_value ? `normalized: ${value.normalized_value}` : 'unavailable'}
      </p>
    </div>
  )
}

function ComparisonTable({ comparisons }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_10px_rgba(22,35,43,0.05)]">
      <div className="grid grid-cols-[1.05fr_1.35fr_1.35fr_130px] gap-4 bg-[#FBF9F4] px-6 py-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#71808A]">
        <span>Field</span>
        <span>Shipping instruction</span>
        <span>Draft bill of lading</span>
        <span>Result</span>
      </div>
      {comparisons.map((comparison) => {
        const field = fieldLabels[comparison.field_name] || { label: comparison.field_name }
        const uncertain = comparison.result === 'skipped'
        const mismatch = comparison.result === 'mismatch'
        return (
          <div
            key={comparison.field_name}
            className={cn(
              'grid grid-cols-[1.05fr_1.35fr_1.35fr_130px] gap-4 border-t border-[#E9E5D9] px-6 py-5',
              mismatch && 'bg-[#FEF0EE]',
              uncertain && 'bg-[#FFF8E9]',
            )}
          >
            <div>
              <p
                className={cn(
                  'font-semibold',
                  mismatch ? 'text-[#8C2A24]' : uncertain ? 'text-[#8A5300]' : 'text-[#26353D]',
                )}
              >
                {field.label}
              </p>
              {field.unit && <p className="mt-1 text-xs text-[#71808A]">{field.unit}</p>}
            </div>
            <ValueCell value={comparison.si} side="si" />
            <ValueCell value={comparison.bl} side="bl" />
            <div>
              {mismatch ? (
                <StatusBadge status={STATUS.MISMATCH} />
              ) : uncertain ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBEBCF] px-3 py-1 text-xs font-semibold text-[#8A5300]">
                  <Warning size={12} />
                  Needs review
                </span>
              ) : (
                <StatusBadge status={STATUS.OK} />
              )}
              <p className="mt-2 font-mono text-xs text-[#71808A]">
                {comparison.bl?.source || comparison.si?.source || 'rule'}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const SNIPPET_CONTEXT = 2

function DocumentSnippet({ document, comparison, comparisons }) {
  const side = document.role === 'BL' ? 'bl' : 'si'
  const value = comparison?.[side]?.raw_value
  const flagged = comparison?.result === 'mismatch' || comparison?.result === 'skipped'
  const tone =
    comparison?.result === 'skipped'
      ? { box: 'border-[#C47A00] bg-[#C47A00]/10', tag: 'bg-[#C47A00]', label: 'Uncertain' }
      : { box: 'border-[#CF3B32] bg-[#CF3B32]/10', tag: 'bg-[#CF3B32]', label: 'Mismatch' }

  const lines = document.text_preview
    ? document.text_preview.split('\n')
    : (comparisons || []).map(
        (item) =>
          `${fieldLabels[item.field_name]?.label || item.field_name}: ${item[side]?.raw_value ?? 'Not found'}`,
      )
  const matchIndex =
    flagged && value
      ? lines.findIndex((line) => line.toLowerCase().includes(value.toLowerCase()))
      : -1
  const start = matchIndex >= 0 ? Math.max(0, matchIndex - SNIPPET_CONTEXT) : 0
  const end = matchIndex >= 0 ? matchIndex + SNIPPET_CONTEXT + 1 : 6
  const visible = lines.slice(start, end)

  return (
    <figure className="mt-3">
      <div className="overflow-hidden rounded-md border border-[#E3DED1] bg-white font-mono text-xs leading-6 text-[#46555E] shadow-sm">
        {start > 0 && <p className="bg-[#F6F3EC] px-3 text-[#9AA4A8]">⋯</p>}
        {visible.map((line, offset) => {
          const index = start + offset
          const position =
            index === matchIndex ? line.toLowerCase().indexOf(value.toLowerCase()) : -1
          return (
            <div className="flex" key={index}>
              <span className="w-8 shrink-0 select-none bg-[#F6F3EC] pr-2 text-right text-[#9AA4A8]">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words px-3">
                {position >= 0 ? (
                  <>
                    {line.slice(0, position)}
                    <mark
                      className={cn(
                        'relative rounded-sm border-2 px-1 py-0.5 font-semibold text-[#16232B]',
                        tone.box,
                      )}
                    >
                      {line.slice(position, position + value.length)}
                      <span
                        className={cn(
                          'absolute -top-3.5 right-[-2px] rounded-sm px-1 font-sans text-[9px] font-semibold uppercase leading-3 text-white',
                          tone.tag,
                        )}
                      >
                        {tone.label}
                      </span>
                    </mark>
                    {line.slice(position + value.length)}
                  </>
                ) : (
                  line || '\u00a0'
                )}
              </span>
            </div>
          )
        })}
        {end < lines.length && <p className="bg-[#F6F3EC] px-3 text-[#9AA4A8]">⋯</p>}
      </div>
      <figcaption className="mt-2 text-xs text-[#71808A]">
        {matchIndex >= 0
          ? `${document.role || 'Document'} · line ${matchIndex + 1} — highlighted value differs from the other document`
          : flagged
            ? 'Highlighted value is outside the stored preview. Use Open to see the full document.'
            : 'No mismatch to highlight in this document.'}
      </figcaption>
    </figure>
  )
}

function EvidencePanel({ result }) {
  const evidence =
    result?.comparisons?.find((item) => item.result === 'mismatch' || item.result === 'skipped') ||
    result?.comparisons?.[0]
  return (
    <section className="rounded-2xl bg-white shadow-[0_2px_10px_rgba(22,35,43,0.05)] p-6">
      <h2 className="text-xl font-semibold text-[#26353D]">Source evidence</h2>
      <p className="mt-1 text-sm text-[#71808A]">
        {evidence?.field_name
          ? `${fieldLabels[evidence.field_name]?.label || evidence.field_name}, as written in each document`
          : 'Evidence retained from the pipeline'}
      </p>
      <div className="mt-5 space-y-4">
        {result?.documents?.map((document) => (
          <div className="rounded-xl border border-[#E9E5D9] bg-[#FBF9F4] p-4" key={document.path}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#62757D]">
                {document.role || 'Document'} · {document.path.split('/').pop()}
              </p>
              <a
                className="inline-block rounded-md px-2 py-1 text-xs font-semibold text-[#0E5A66] hover:bg-[#E6F0F1] transition-transform duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
                href={attachmentUrl(document.path)}
                target="_blank"
                rel="noreferrer"
              >
                Open
              </a>
            </div>
            {document.readable === false ? (
              <p className="mt-3 text-sm text-[#71808A]">Unreadable document. Review required.</p>
            ) : (
              <DocumentSnippet
                document={document}
                comparison={evidence}
                comparisons={result.comparisons}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function DecisionTimeline({ result }) {
  const steps = [
    ['Classify', 'Document comparison — keywords and attachments', true],
    [
      'Extract',
      result?.documents?.some((document) => !document.readable)
        ? 'Vision fallback or unreadable input needs review'
        : 'Required fields extracted from both documents',
      !result?.documents?.some((document) => !document.readable),
    ],
    [
      'Compare',
      `${result?.defect_fields?.length || 0} mismatch · ${result?.skipped_fields?.length || 0} fields skipped`,
      true,
    ],
    [
      'Decide',
      result?.status === STATUS.NEEDS_REVIEW
        ? `Needs review · reason: ${result.review_reason}`
        : `${result?.status === STATUS.MISMATCH ? 'Mismatch' : 'No mismatch'} · no review needed`,
      result?.status !== STATUS.MISMATCH,
    ],
  ]
  return (
    <section className="rounded-2xl bg-white shadow-[0_2px_10px_rgba(22,35,43,0.05)] p-6">
      <h2 className="text-xl font-semibold text-[#26353D]">How this was decided</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {steps.map(([label, detail, good]) => (
          <div className="flex gap-3" key={label}>
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full',
                good ? 'bg-[#E2F1E8] text-[#17693F]' : 'bg-[#FBEBCF] text-[#8A5300]',
              )}
            >
              {good ? <Check size={15} weight="bold" /> : <Warning size={15} weight="bold" />}
            </span>
            <div>
              <p className="font-semibold text-[#26353D]">{label}</p>
              <p className="mt-1 text-sm leading-5 text-[#71808A]">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ReviewPanel({ emailId, result, onSaved }) {
  const reviewField =
    result?.skipped_fields?.[0] ||
    result?.comparisons?.find((item) => item.result === 'skipped')?.field_name ||
    'gross_weight_kg'
  const [fieldName, setFieldName] = useState(reviewField)
  const [action, setAction] = useState('confirm')
  const [correctedValue, setCorrectedValue] = useState('')
  const [saving, setSaving] = useState(false)
  const field = result?.comparisons?.find((item) => item.field_name === fieldName)

  async function save() {
    setSaving(true)
    const response = await resolveEmail(emailId, {
      field_name: fieldName,
      action,
      corrected_value: action === 'correct' ? correctedValue : null,
    })
    onSaved(response.result)
    setSaving(false)
  }

  return (
    <section className="rounded-2xl bg-white shadow-[0_2px_10px_rgba(22,35,43,0.05)] p-6">
      <h2 className="text-xl font-semibold text-[#26353D]">
        Resolve {fieldLabels[fieldName]?.label || fieldName}
      </h2>
      <p className="mt-1 text-sm text-[#71808A]">
        Your decision updates the report and is saved with the evidence.
      </p>
      <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.06em] text-[#71808A]">
        Field under review
        <select
          className="mt-2 h-11 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 text-sm text-[#26353D]"
          value={fieldName}
          onChange={(event) => setFieldName(event.target.value)}
        >
          {(result?.skipped_fields?.length ? result.skipped_fields : [fieldName]).map((key) => (
            <option key={key} value={key}>
              {fieldLabels[key]?.label || key}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-4 grid gap-3">
        <button
          className={cn(
            'rounded-xl border p-4 text-left',
            action === 'confirm' ? 'border-[#0E5A66] bg-[#E1EEF0]' : 'border-[#D5D0C2]',
          )}
          onClick={() => setAction('confirm')}
        >
          <p className="font-semibold text-[#26353D]">Confirm the scan reading</p>
          <p className="mt-1 text-sm text-[#71808A]">
            The BL value is {field?.bl?.raw_value || 'the extracted value'}.
          </p>
        </button>
        <button
          className={cn(
            'rounded-xl border p-4 text-left',
            action === 'correct' ? 'border-[#0E5A66] bg-[#E1EEF0]' : 'border-[#D5D0C2]',
          )}
          onClick={() => setAction('correct')}
        >
          <p className="font-semibold text-[#26353D]">Correct the value</p>
          <p className="mt-1 text-sm text-[#71808A]">The scan was misread.</p>
        </button>
      </div>
      {action === 'correct' && (
        <input
          className="mt-3 h-11 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 font-mono text-sm"
          value={correctedValue}
          onChange={(event) => setCorrectedValue(event.target.value)}
          placeholder={field?.si?.raw_value || 'Corrected value'}
        />
      )}
      {action === 'confirm' && (
        <div className="mt-5 rounded-xl border border-[#F2C2BC] bg-[#F8E3E0] p-4 font-mono text-xs text-[#A32720]">
          {emailId.toUpperCase()} — MISMATCH — {fieldLabels[fieldName]?.label}: SI{' '}
          {field?.si?.normalized_value || '—'} / BL {field?.bl?.normalized_value || '—'}
        </div>
      )}
      <button
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0E5A66] font-semibold text-white hover:bg-[#0B4B55] disabled:opacity-60 transition-transform duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
        onClick={save}
        disabled={saving || (action === 'correct' && !correctedValue)}
      >
        <FloppyDisk size={18} />
        {saving ? 'Saving…' : 'Save decision'}
      </button>
    </section>
  )
}

export function CaseDetailPage({ navigate, emailId }) {
  const [detail, setDetail] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    getEmail(emailId).then(setDetail)
  }, [emailId])

  if (!detail)
    return (
      <div className="p-8 lg:p-12">
        <div className="h-8 w-64 animate-pulse rounded bg-[#E9E5D9]" />
        <div className="mt-8 h-80 animate-pulse rounded-2xl bg-white" />
      </div>
    )

  const result = detail.result
  const isReview = result?.status === STATUS.NEEDS_REVIEW
  const mismatches = result?.defect_fields?.length || 0
  const headline =
    detail.subject || (isReview ? 'BL draft for verification' : 'Document comparison')

  async function retry() {
    await retryEmail(emailId)
    setNotice('Retry started. The pipeline will update this case.')
  }

  function updateResult(next) {
    setDetail((current) => ({ ...current, result: next }))
    setNotice('Decision saved and report updated.')
  }

  return (
    <div className="mx-auto max-w-[1540px] px-5 py-10 lg:px-14">
      <header>
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-[#0E5A66]">
          <button
            className="inline-flex items-center gap-2 hover:underline"
            onClick={() => navigate(isReview ? '/review' : '/inbox')}
          >
            <ArrowLeft size={16} />
            {isReview ? 'Review queue' : 'Inbox'}
          </button>
          <span>/</span>
          <span className="font-mono text-[#71808A]">{detail.display_id}</span>
          <StatusBadge status={result?.status} />
          <CategoryBadge category={result?.category} />
        </div>
        <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight text-[#16232B] sm:text-5xl">
              {headline}
            </h1>
            <p className="mt-3 text-sm text-[#71808A]">
              From {detail.sender} · Received 19 Sep 2026, 09:12 ·{' '}
              {detail.attachments?.map((item) => item.filename).join(' · ') ||
                'attachments loaded from fixture data'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#D5D0C2] bg-white px-5 font-semibold text-[#26353D] transition-transform duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
              onClick={() => navigator.clipboard?.writeText(JSON.stringify(result))}
            >
              <Clipboard size={18} />
              Copy report
            </button>
            {!isReview && (
              <button
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#0E5A66] px-5 font-semibold text-white transition-transform duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
                onClick={() => navigate('/inbox')}
              >
                <Check size={18} />
                Mark as reviewed
              </button>
            )}
          </div>
        </div>
      </header>

      {isReview ? (
        <div className="mt-7 rounded-2xl bg-[#FBEBCF] shadow-[0_2px_10px_rgba(22,35,43,0.05)] p-7">
          <div className="flex gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#8A5300]">
              <Warning size={24} />
            </span>
            <div>
              <h2 className="font-serif text-2xl font-semibold text-[#5A3A08]">
                Gross weight can’t be confirmed from the scan
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#72541E]">
                BL page 1 is an image. The vision fallback read 22,600 kg with low confidence, while
                the SI says 22,000 kg. Nothing was guessed. The other 6 fields match.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-7 flex flex-col justify-between gap-4 rounded-2xl bg-[#F8E3E0] shadow-[0_2px_10px_rgba(22,35,43,0.05)] p-7 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#A32720]">
              {mismatches} of 7 fields differ
            </p>
            <h2 className="mt-1 font-serif text-3xl font-semibold text-[#7E251F]">
              Container count <span className="font-mono text-2xl">SI: 3 / BL: 4</span>
            </h2>
          </div>
          <div className="rounded-xl border border-[#F2C2BC] bg-white px-4 py-3 font-mono text-sm text-[#5B686E]">
            {detail.display_id} — MISMATCH — Container count
          </div>
        </div>
      )}

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.75fr)]">
        <div className="space-y-7">
          <ComparisonTable comparisons={result?.comparisons || []} />
          <DecisionTimeline result={result} />
        </div>
        <div className="space-y-7">
          <EvidencePanel result={result} />
          {isReview ? (
            <ReviewPanel emailId={emailId} result={result} onSaved={updateResult} />
          ) : (
            <section className="rounded-2xl bg-white shadow-[0_2px_10px_rgba(22,35,43,0.05)] p-6">
              <h2 className="text-xl font-semibold text-[#26353D]">Next action</h2>
              <p className="mt-2 text-sm leading-6 text-[#71808A]">
                This case has a deterministic mismatch. Copy the report or return to the inbox to
                continue triage.
              </p>
              <button
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#D5D0C2] font-semibold text-[#26353D] transition-transform duration-200 ease-out hover:scale-105 hover:shadow-md active:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100"
                onClick={retry}
              >
                <X size={17} />
                Retry processing
              </button>
            </section>
          )}
        </div>
      </div>
      {notice && (
        <div
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#16232B] px-5 py-3 text-sm font-semibold text-white shadow-xl"
          role="status"
        >
          {notice}
        </div>
      )}
    </div>
  )
}
