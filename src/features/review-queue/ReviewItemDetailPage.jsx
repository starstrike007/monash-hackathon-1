import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Warning } from '@phosphor-icons/react'

import { DocumentViewer } from '@/components/document-viewer/DocumentViewer'
import { reasonLabel } from '@/features/review-queue/reasons'
import { fieldLabels } from '@/features/docs-comparison/summary'
import { getEmail, getReviewItem, resolveReviewItem } from '@/lib/api'
import { CATEGORY_LABELS, formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

const RECLASSIFY_OPTIONS = ['SI_REQUEST', 'INVOICE_QUERY', 'GENERAL', 'SPAM']

function ConfirmCorrectPanel({ itemId, email, fieldOptions, onSaved }) {
  const [fieldName, setFieldName] = useState(fieldOptions[0] || '')
  const [action, setAction] = useState('confirm')
  const [correctedValue, setCorrectedValue] = useState('')
  const [saving, setSaving] = useState(false)
  const comparison = email?.result?.comparisons?.find((item) => item.field_name === fieldName)

  async function save() {
    setSaving(true)
    const outcome = await resolveReviewItem(itemId, {
      action,
      field_name: fieldName,
      corrected_value: action === 'correct' ? correctedValue : null,
    })
    setSaving(false)
    onSaved(outcome)
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[#26353D]">Resolve this field</h2>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#71808A]">
        Field
        <select
          className="mt-2 h-11 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 text-sm"
          value={fieldName}
          onChange={(event) => setFieldName(event.target.value)}
        >
          {fieldOptions.map((key) => (
            <option key={key} value={key}>
              {fieldLabels[key]?.label || key}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-4 grid gap-3">
        <button
          type="button"
          className={cn(
            'rounded-xl border p-4 text-left',
            action === 'confirm' ? 'border-[#0E5A66] bg-[#E1EEF0]' : 'border-[#D5D0C2]',
          )}
          onClick={() => setAction('confirm')}
        >
          <p className="font-semibold text-[#26353D]">Confirm the reading is correct</p>
          <p className="mt-1 text-sm text-[#71808A]">
            BL value is {comparison?.bl?.raw_value || 'as extracted'}.
          </p>
        </button>
        <button
          type="button"
          className={cn(
            'rounded-xl border p-4 text-left',
            action === 'correct' ? 'border-[#0E5A66] bg-[#E1EEF0]' : 'border-[#D5D0C2]',
          )}
          onClick={() => setAction('correct')}
        >
          <p className="font-semibold text-[#26353D]">Enter the correct value</p>
          <p className="mt-1 text-sm text-[#71808A]">The extracted reading was wrong or missing.</p>
        </button>
      </div>
      {action === 'correct' && (
        <input
          className="mt-3 h-11 w-full rounded-lg border border-[#D5D0C2] px-3 font-mono text-sm"
          value={correctedValue}
          onChange={(event) => setCorrectedValue(event.target.value)}
          placeholder={comparison?.si?.raw_value || 'Corrected value'}
        />
      )}
      <button
        className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0E5A66] text-sm font-semibold text-white disabled:opacity-60"
        onClick={save}
        disabled={saving || !fieldName || (action === 'correct' && !correctedValue)}
      >
        {saving ? 'Saving…' : 'Save decision'}
      </button>
    </section>
  )
}

function ReclassifyPanel({ itemId, onSaved, defaultNote }) {
  const [category, setCategory] = useState('GENERAL')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const outcome = await resolveReviewItem(itemId, {
      action: 'reclassify',
      new_category: category,
    })
    setSaving(false)
    onSaved(outcome)
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[#26353D]">Reclassify away from comparison</h2>
      <p className="mt-1 text-sm text-[#71808A]">{defaultNote}</p>
      <select
        className="mt-4 h-11 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 text-sm"
        value={category}
        onChange={(event) => setCategory(event.target.value)}
      >
        {RECLASSIFY_OPTIONS.map((key) => (
          <option key={key} value={key}>
            {CATEGORY_LABELS[key] || key}
          </option>
        ))}
      </select>
      <button
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0E5A66] text-sm font-semibold text-white disabled:opacity-60"
        onClick={save}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Reclassify'}
      </button>
    </section>
  )
}

function DraftReplyPanel({ email }) {
  const draft = `Hi,\n\nWe're missing an attachment needed to verify ${email?.subject || 'this shipment'}. Could you resend the Shipping Instruction and draft Bill of Lading?\n\nThanks,\nShipCheck team`
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[#26353D]">
        Draft reply (copy only, nothing is sent)
      </h2>
      <textarea
        readOnly
        className="mt-3 h-32 w-full rounded-lg border border-[#D5D0C2] bg-[#FBF9F4] p-3 font-mono text-xs text-[#26353D]"
        value={draft}
      />
      <button
        type="button"
        className="mt-3 inline-flex h-9 items-center rounded-lg bg-white px-4 text-sm font-semibold text-[#26353D] shadow-sm"
        onClick={() => navigator.clipboard?.writeText(draft)}
      >
        Copy to clipboard
      </button>
    </section>
  )
}

function ReassignRolesPanel({ itemId, email, onSaved }) {
  const attachments = email?.attachments || []
  const [siPath, setSiPath] = useState(attachments[0]?.path || '')
  const [blPath, setBlPath] = useState(attachments[1]?.path || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const outcome = await resolveReviewItem(itemId, {
      action: 'reassign_roles',
      si_path: siPath,
      bl_path: blPath,
    })
    setSaving(false)
    onSaved(outcome)
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[#26353D]">Reassign SI / BL</h2>
      <p className="mt-1 text-sm text-[#71808A]">
        Pick which attachment is the Shipping Instruction and which is the draft Bill of Lading.
      </p>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#71808A]">
        Shipping instruction
        <select
          className="mt-2 h-11 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 text-sm"
          value={siPath}
          onChange={(event) => setSiPath(event.target.value)}
        >
          {attachments.map((attachment) => (
            <option key={attachment.path} value={attachment.path}>
              {attachment.filename}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-[#71808A]">
        Draft bill of lading
        <select
          className="mt-2 h-11 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 text-sm"
          value={blPath}
          onChange={(event) => setBlPath(event.target.value)}
        >
          {attachments.map((attachment) => (
            <option key={attachment.path} value={attachment.path}>
              {attachment.filename}
            </option>
          ))}
        </select>
      </label>
      <button
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0E5A66] text-sm font-semibold text-white disabled:opacity-60"
        onClick={save}
        disabled={saving || !siPath || !blPath || siPath === blPath}
      >
        {saving ? 'Saving…' : 'Reassign and recompute'}
      </button>
    </section>
  )
}

function RetryPanel({ itemId, onSaved }) {
  const [saving, setSaving] = useState(false)
  async function retry() {
    setSaving(true)
    const outcome = await resolveReviewItem(itemId, { action: 'retry' })
    setSaving(false)
    onSaved(outcome)
  }
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[#26353D]">Processing failed</h2>
      <p className="mt-1 text-sm text-[#71808A]">
        This never became a defect - it stayed a visible, retryable failure.
      </p>
      <button
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0E5A66] text-sm font-semibold text-white disabled:opacity-60"
        onClick={retry}
        disabled={saving}
      >
        {saving ? 'Retrying…' : 'Retry this email'}
      </button>
    </section>
  )
}

export function ReviewItemDetailPage({ navigate, itemId }) {
  const [item, setItem] = useState(null)
  const [email, setEmail] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    getReviewItem(itemId).then((data) => {
      setItem(data)
      getEmail(data.email_id).then(setEmail)
    })
  }, [itemId])

  const siDoc = email?.result?.documents?.find((document) => document.role === 'SI')
  const blDoc = email?.result?.documents?.find((document) => document.role === 'BL')
  const flaggedFields = useMemo(() => {
    if (!email?.result) return []
    const fromSkipped = email.result.skipped_fields || []
    if (fromSkipped.length) return fromSkipped
    return (email.result.comparisons || []).map((entry) => entry.field_name)
  }, [email])

  function handleSaved(outcome) {
    setNotice('Saved. The report and dashboard are updated.')
    if (outcome?.review_item) setItem(outcome.review_item)
    if (item) getEmail(item.email_id).then(setEmail)
  }

  if (!item) {
    return (
      <div className="p-8 lg:p-12">
        <div className="h-8 w-64 animate-pulse rounded bg-[#E9E5D9]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-10 lg:px-14">
      <button
        type="button"
        onClick={() => navigate('/review')}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#26353D] shadow-sm"
      >
        <ArrowLeft size={16} />
        Review queue
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-[#71808A]">
          {email?.display_id || item.email_id}
        </span>
        <span className="inline-flex items-center rounded-full bg-[#FBEBCF] px-3 py-1 text-xs font-semibold text-[#8A5300]">
          {reasonLabel(item.reason)}
        </span>
        {item.status === 'resolved' && (
          <span className="inline-flex items-center rounded-full bg-[#E2F1E8] px-3 py-1 text-xs font-semibold text-[#17693F]">
            Resolved
          </span>
        )}
      </div>
      <h1 className="mt-3 font-serif text-4xl font-semibold text-[#16232B]">
        {email?.subject || item.email_id}
      </h1>
      <p className="mt-2 text-sm text-[#71808A]">Received {formatDate(email?.received_at)}</p>

      <div className="mt-6 flex gap-4 rounded-2xl border border-[#EFD9A6] bg-[#FBEBCF] p-6">
        <Warning size={22} className="mt-0.5 shrink-0 text-[#8A5300]" />
        <div>
          <p className="font-semibold text-[#5A3A08]">Why this needs a person</p>
          <p className="mt-1 text-sm leading-6 text-[#72541E]">{item.description}</p>
        </div>
      </div>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {item.status === 'open' && item.reason === 'processing_failed' && (
            <RetryPanel itemId={item.id} onSaved={handleSaved} />
          )}
          {item.status === 'open' &&
            (item.reason === 'unreadable' || item.reason === 'missing_value') && (
              <ConfirmCorrectPanel
                itemId={item.id}
                email={email}
                fieldOptions={flaggedFields}
                onSaved={handleSaved}
              />
            )}
          {item.status === 'open' && item.reason === 'wrong_doc_type' && (
            <ReassignRolesPanel itemId={item.id} email={email} onSaved={handleSaved} />
          )}
          {item.status === 'open' && item.reason === 'missing_attachment' && (
            <>
              <ReclassifyPanel
                itemId={item.id}
                onSaved={handleSaved}
                defaultNote="If this was never really a comparison request, set its real category. The export will use this from now on."
              />
              <DraftReplyPanel email={email} />
              <p className="text-xs text-[#8A7F68]">
                Uploading a replacement SI/BL from your device isn't available in this build -
                reclassify the email or draft a reply asking the sender to resend it.
              </p>
            </>
          )}
          {item.status === 'resolved' && (
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-[#26353D]">Resolution</h2>
              <pre className="mt-2 overflow-auto rounded-lg bg-[#FBF9F4] p-3 font-mono text-xs text-[#46555E]">
                {JSON.stringify(item.resolution, null, 2)}
              </pre>
            </section>
          )}
        </div>
        <div className="grid gap-4">
          <div className="h-[360px]">
            <DocumentViewer path={siDoc?.path} label="Shipping instruction" location={null} />
          </div>
          <div className="h-[360px]">
            <DocumentViewer path={blDoc?.path} label="Draft bill of lading" location={null} />
          </div>
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
