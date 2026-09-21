import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Warning } from '@phosphor-icons/react'

import { BackendError } from '@/components/BackendError'
import { DocumentViewer } from '@/components/document-viewer/DocumentViewer'
import { reasonLabel } from '@/features/review-queue/reasons'
import { fieldLabels } from '@/features/docs-comparison/summary'
import { getEmail, getReviewItem, notifyDataChanged, resolveReviewItem, uploadReviewAttachment } from '@/lib/api'
import { CATEGORY_LABELS, FIELDS, formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

const RECLASSIFY_OPTIONS = ['SI_REQUEST', 'INVOICE_QUERY', 'GENERAL', 'SPAM']

function ConfirmCorrectPanel({ itemId, email, fieldOptions, onSaved }) {
  const [fieldName, setFieldName] = useState(fieldOptions[0] || '')
  const [action, setAction] = useState('confirm')
  const [correctedValue, setCorrectedValue] = useState('')
  const [saving, setSaving] = useState(false)
  const comparison = email?.result?.comparisons?.find((item) => item.field_name === fieldName)

  useEffect(() => {
    setFieldName((current) => current || fieldOptions[0] || '')
  }, [fieldOptions])

  async function save() {
    setSaving(true)
    try {
      const outcome = await resolveReviewItem(itemId, {
        action,
        field_name: fieldName,
        corrected_value: action === 'correct' ? correctedValue : null,
      })
      onSaved(outcome)
    } catch (reason) {
      onSaved(null, reason)
    } finally {
      setSaving(false)
    }
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
        {email?.result?.review_reason === 'missing_value' && (
          <button
            type="button"
            className={cn(
              'rounded-xl border p-4 text-left',
              action === 'confirm_absent' ? 'border-[#8A5300] bg-[#FFF8E9]' : 'border-[#D5D0C2]',
            )}
            onClick={() => setAction('confirm_absent')}
          >
            <p className="font-semibold text-[#26353D]">Confirm the field is absent</p>
            <p className="mt-1 text-sm text-[#71808A]">
              Record the absence as a discrepancy for this field.
            </p>
          </button>
        )}
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

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function UploadMissingPanel({ itemId, onSaved }) {
  const [role, setRole] = useState('SI')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  async function upload() {
    if (!file) return
    setSaving(true)
    try {
      const outcome = await uploadReviewAttachment(itemId, {
        action: 'upload_missing',
        role,
        filename: file.name,
        content_base64: await fileToBase64(file),
      })
      onSaved(outcome)
    } catch (reason) {
      onSaved(null, reason)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[#26353D]">Upload a replacement attachment</h2>
      <p className="mt-1 text-sm text-[#71808A]">
        The file is stored with this case, attached to the email, and the comparison is rerun.
      </p>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#71808A]">
        Attachment role
        <select
          className="mt-2 h-11 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="SI">Shipping instruction</option>
          <option value="BL">Draft bill of lading</option>
        </select>
      </label>
      <input
        type="file"
        accept=".txt,.pdf,.docx,.xlsx"
        className="mt-3 block w-full text-sm text-[#46555E]"
        onChange={(event) => setFile(event.target.files?.[0] || null)}
      />
      <button
        type="button"
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0E5A66] text-sm font-semibold text-white disabled:opacity-60"
        onClick={upload}
        disabled={saving || !file}
      >
        {saving ? 'Uploading and recomputing…' : 'Upload and recompute'}
      </button>
    </section>
  )
}

function ReclassifyPanel({ itemId, onSaved, defaultNote }) {
  const [category, setCategory] = useState('GENERAL')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const outcome = await resolveReviewItem(itemId, {
        action: 'reclassify',
        new_category: category,
      })
      onSaved(outcome)
    } catch (reason) {
      onSaved(null, reason)
    } finally {
      setSaving(false)
    }
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
  const draft = `Hi,\n\nWe're missing an attachment needed to verify ${email?.subject || 'this shipment'}. Could you resend the Shipping Instruction and draft Bill of Lading?\n\nThanks,\nClearance team`
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
  const [missingPath, setMissingPath] = useState(attachments[0]?.path || '')
  const [missingRole, setMissingRole] = useState('SI')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSiPath((current) => current || attachments[0]?.path || '')
    setBlPath((current) => current || attachments[1]?.path || '')
    setMissingPath((current) => current || attachments[0]?.path || '')
  }, [email, attachments])

  async function save() {
    setSaving(true)
    try {
      const outcome = await resolveReviewItem(itemId, {
        action: 'reassign_roles',
        si_path: siPath,
        bl_path: blPath,
      })
      onSaved(outcome)
    } catch (reason) {
      onSaved(null, reason)
    } finally {
      setSaving(false)
    }
  }

  async function markMissing() {
    setSaving(true)
    try {
      const outcome = await resolveReviewItem(itemId, {
        action: 'mark_missing',
        missing_role: missingRole,
        missing_path: missingPath,
      })
      onSaved(outcome)
    } catch (reason) {
      onSaved(null, reason)
    } finally {
      setSaving(false)
    }
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
      <div className="mt-5 border-t border-[#E9E5D9] pt-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-[#71808A]">
          Mark a document missing
          <select
            className="mt-2 h-11 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 text-sm"
            value={missingRole}
            onChange={(event) => setMissingRole(event.target.value)}
          >
            <option value="SI">Shipping instruction</option>
            <option value="BL">Draft bill of lading</option>
          </select>
        </label>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-[#71808A]">
          Attachment to exclude
          <select
            className="mt-2 h-11 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 text-sm"
            value={missingPath}
            onChange={(event) => setMissingPath(event.target.value)}
          >
            {attachments.map((attachment) => (
              <option key={attachment.path} value={attachment.path}>
                {attachment.filename}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#8A5300] bg-[#FFF8E9] text-sm font-semibold text-[#8A5300] disabled:opacity-60"
          onClick={markMissing}
          disabled={saving}
        >
          Mark missing and recompute
        </button>
      </div>
    </section>
  )
}

function RetryPanel({ itemId, onSaved }) {
  const [saving, setSaving] = useState(false)
  async function retry() {
    setSaving(true)
    try {
      const outcome = await resolveReviewItem(itemId, { action: 'retry' })
      onSaved(outcome)
    } catch (reason) {
      onSaved(null, reason)
    } finally {
      setSaving(false)
    }
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
  const [error, setError] = useState(null)
  const [activeField, setActiveField] = useState(null)

  useEffect(() => {
    setError(null)
    getReviewItem(itemId)
      .then((data) => {
        setItem(data)
        getEmail(data.email_id).then(setEmail).catch(setError)
      })
      .catch(setError)
  }, [itemId])

  const documents = email?.result?.documents || []
  const siDoc = documents.find((document) => document.role === 'SI') || documents[0]
  const blDoc = documents.find((document) => document.role === 'BL') || documents[1]
  const flaggedFields = useMemo(() => {
    if (!email?.result) return []
    const fromSkipped = email.result.skipped_fields || []
    if (fromSkipped.length) return fromSkipped
    const compared = (email.result.comparisons || []).map((entry) => entry.field_name)
    return compared.length ? compared : FIELDS.map((field) => field.key)
  }, [email])

  useEffect(() => {
    setActiveField((field) => field || flaggedFields[0] || null)
  }, [flaggedFields])

  const activeComparison = email?.result?.comparisons?.find(
    (comparison) => comparison.field_name === activeField,
  )

  function handleSaved(outcome, reason = null) {
    if (reason) {
      setError(reason)
      return
    }
    notifyDataChanged()
    setNotice('Saved. The report and dashboard are updated.')
    if (outcome?.review_item) setItem(outcome.review_item)
    if (item) getEmail(item.email_id).then(setEmail).catch(setError)
  }

  if (error && !item) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-10 lg:px-14">
        <BackendError error={error} onRetry={() => window.location.reload()} />
      </div>
    )
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
      {error && <div className="mt-5"><BackendError error={error} compact /></div>}

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
              <UploadMissingPanel itemId={item.id} onSaved={handleSaved} />
              <ReclassifyPanel
                itemId={item.id}
                onSaved={handleSaved}
                defaultNote="If this was never really a comparison request, set its real category. The export will use this from now on."
              />
              <DraftReplyPanel email={email} />
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
          {flaggedFields.length > 0 && (
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#71808A]">
              Evidence field
              <select
                className="mt-2 h-10 w-full rounded-lg border border-[#D5D0C2] bg-white px-3 text-sm normal-case"
                value={activeField || ''}
                onChange={(event) => setActiveField(event.target.value)}
              >
                {flaggedFields.map((field) => (
                  <option key={field} value={field}>
                    {fieldLabels[field]?.label || field}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="h-[360px]">
            <DocumentViewer
              path={siDoc?.path}
              label="Shipping instruction"
              location={activeComparison?.si?.evidence}
              readable={siDoc?.readable}
            />
          </div>
          <div className="h-[360px]">
            <DocumentViewer
              path={blDoc?.path}
              label="Draft bill of lading"
              location={activeComparison?.bl?.evidence}
              readable={blDoc?.readable}
            />
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
