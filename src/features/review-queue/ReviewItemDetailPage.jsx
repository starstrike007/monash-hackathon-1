import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, EnvelopeSimple, Trash, Warning } from '@phosphor-icons/react'

import { BackendError } from '@/components/BackendError'
import { DocumentViewer } from '@/components/document-viewer/DocumentViewer'
import { LoadingBoat } from '@/components/LoadingBoat'
import { reasonLabel } from '@/features/review-queue/reasons'
import { fieldLabels } from '@/features/docs-comparison/summary'
import {
  getEmail,
  getReviewItem,
  notifyDataChanged,
  resolveReviewItem,
  uploadReviewAttachment,
} from '@/lib/api'
import { CATEGORY_LABELS, FIELDS, formatDate } from '@/lib/types'
import { cn } from '@/lib/utils'

const RECLASSIFY_OPTIONS = ['SI_REQUEST', 'INVOICE_QUERY', 'GENERAL', 'SPAM']

function ResolveIssueButton({ itemId, onSaved }) {
  const [saving, setSaving] = useState(false)

  async function resolve() {
    setSaving(true)
    try {
      const outcome = await resolveReviewItem(itemId, { action: 'resolve' })
      onSaved(outcome)
    } catch (reason) {
      onSaved(null, reason)
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      type="button"
      className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0F172A] text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#1E293B]"
      onClick={resolve}
      disabled={saving}
    >
      {saving ? 'Resolving...' : 'Resolve this issue'}
    </button>
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
  const fileInputRef = useRef(null)

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
    <section className="rounded-2xl bg-white p-6 border border-slate-200">
      <h2 className="font-display text-lg font-semibold text-[#1E293B]">
        Upload a replacement attachment
      </h2>
      <p className="mt-1 text-sm text-[#64748B]">
        The file is stored with this case, attached to the email, and the comparison is rerun.
      </p>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
        Attachment role
        <select
          className="mt-2 h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="SI">Shipping instruction</option>
          <option value="BL">Draft bill of lading</option>
        </select>
      </label>
      <div className="mt-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
          Attachment file
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label
            htmlFor={`review-upload-${itemId}`}
            className="inline-flex cursor-pointer items-center text-sm font-semibold text-[#0F172A] underline underline-offset-4 transition-colors hover:text-[#34558F]"
          >
            Choose file
          </label>
          <input
            id={`review-upload-${itemId}`}
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.docx,.xlsx"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <span className="min-w-0 max-w-full truncate text-sm text-[#475569]">
            {file?.name || 'No file selected'}
          </span>
          {file && (
            <button
              type="button"
              onClick={() => {
                setFile(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="inline-flex items-center gap-1 text-sm font-semibold text-[#B91C1C] underline underline-offset-4 hover:text-[#991B1B]"
            >
              <Trash size={14} aria-hidden="true" />
              Remove
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-[#94A3B8]">TXT, PDF, DOCX or XLSX</p>
      </div>
      <button
        type="button"
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0F172A] text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#1E293B]"
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
    <section className="rounded-2xl bg-white p-6 border border-slate-200">
      <h2 className="font-display text-lg font-semibold text-[#1E293B]">
        Reclassify away from comparison
      </h2>
      <p className="mt-1 text-sm text-[#64748B]">{defaultNote}</p>
      <select
        className="mt-4 h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
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
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0F172A] text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#1E293B]"
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
    <section className="rounded-2xl bg-white p-6 border border-slate-200">
      <h2 className="font-display text-lg font-semibold text-[#1E293B]">
        Draft reply (copy only, nothing is sent)
      </h2>
      <textarea
        readOnly
        className="mt-3 h-32 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-3 font-mono text-xs text-[#1E293B]"
        value={draft}
      />
      <button
        type="button"
        className="mt-3 inline-flex h-9 items-center rounded-lg border border-[#0F172A] bg-transparent px-4 text-sm font-semibold text-[#0F172A] hover:bg-slate-100"
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
    <section className="rounded-2xl bg-white p-6 border border-slate-200">
      <h2 className="font-display text-lg font-semibold text-[#1E293B]">Reassign SI / BL</h2>
      <p className="mt-1 text-sm text-[#64748B]">
        Pick which attachment is the Shipping Instruction and which is the draft Bill of Lading.
      </p>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
        Shipping instruction
        <select
          className="mt-2 h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
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
      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
        Draft bill of lading
        <select
          className="mt-2 h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
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
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0F172A] text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#1E293B]"
        onClick={save}
        disabled={saving || !siPath || !blPath || siPath === blPath}
      >
        {saving ? 'Saving…' : 'Reassign and recompute'}
      </button>
      <div className="mt-5 border-t border-[#E2E8F0] pt-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
          Mark a document missing
          <select
            className="mt-2 h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
            value={missingRole}
            onChange={(event) => setMissingRole(event.target.value)}
          >
            <option value="SI">Shipping instruction</option>
            <option value="BL">Draft bill of lading</option>
          </select>
        </label>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
          Attachment to exclude
          <select
            className="mt-2 h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
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
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#B45309] bg-[#FFFBEB] text-sm font-semibold text-[#B45309] disabled:opacity-60"
          onClick={markMissing}
          disabled={saving}
        >
          Mark missing and recompute
        </button>
      </div>
    </section>
  )
}

function EscalationPanel({ itemId, onSaved, onOpenComparison }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const outcome = await resolveReviewItem(itemId, {
        action: 'mark_reviewed',
        note: note.trim() || null,
      })
      onSaved(outcome)
    } catch (reason) {
      onSaved(null, reason)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 border border-slate-200">
      <h2 className="font-display text-lg font-semibold text-[#1E293B]">Review this comparison</h2>
      <p className="mt-1 text-sm text-[#64748B]">
        Check each field against both documents. If a field needs correcting, change its result on
        the document comparison page first, then mark this as reviewed.
      </p>
      <button
        type="button"
        onClick={onOpenComparison}
        className="mt-4 inline-flex h-10 items-center rounded-lg border border-[#0F172A] bg-transparent px-4 text-sm font-semibold text-[#0F172A] hover:bg-slate-100"
      >
        Open document comparison
      </button>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
        Note (optional)
        <textarea
          className="mt-2 min-h-[84px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm normal-case text-[#1E293B]"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What did you check or change?"
        />
      </label>
      <button
        type="button"
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0F172A] text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#1E293B]"
        onClick={save}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Mark as reviewed'}
      </button>
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
    <section className="rounded-2xl bg-white p-6 border border-slate-200">
      <h2 className="font-display text-lg font-semibold text-[#1E293B]">Processing failed</h2>
      <p className="mt-1 text-sm text-[#64748B]">
        This never became a defect - it stayed a visible, retryable failure.
      </p>
      <button
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0F172A] text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#1E293B]"
        onClick={retry}
        disabled={saving}
      >
        {saving ? 'Retrying…' : 'Retry this email'}
      </button>
    </section>
  )
}

function ReopenIssueButton({ itemId, onSaved }) {
  const [saving, setSaving] = useState(false)

  async function reopen() {
    setSaving(true)
    try {
      const outcome = await resolveReviewItem(itemId, { action: 'reopen' })
      onSaved(outcome)
    } catch (reason) {
      onSaved(null, reason)
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      type="button"
      className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#0F172A] bg-transparent text-sm font-semibold text-[#0F172A] transition-colors hover:bg-slate-100 disabled:opacity-60"
      onClick={reopen}
      disabled={saving}
    >
      {saving ? 'Reopening...' : 'Reopen this issue'}
    </button>
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
  // With no attachment there is no document to point evidence at, so the field picker stays empty.
  const hasAttachment =
    (email?.attachments?.length || 0) > 0 || Boolean(siDoc?.path) || Boolean(blDoc?.path)
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
        <LoadingBoat label="Loading review item" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-14">
      <button
        type="button"
        onClick={() => navigate('/review')}
        className="mb-6 inline-flex h-10 items-center gap-2 rounded-lg border border-[#0F172A] bg-transparent px-4 text-sm font-semibold text-[#0F172A] hover:bg-white/60"
      >
        <ArrowLeft size={16} />
        Human review
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-[#475569]">
          {email?.display_id || item.email_id}
        </span>
        <span className="inline-flex items-center rounded-md bg-[#FEF3C7] px-2 py-1 font-mono text-xs font-medium text-amber-700">
          {reasonLabel(item.reason)}
        </span>
        {item.status === 'resolved' && (
          <span className="inline-flex items-center rounded-md bg-[#D1FAE5] px-2 py-1 font-mono text-xs font-medium text-emerald-700">
            Resolved
          </span>
        )}
      </div>
      <h1 className="font-display mt-3 text-[2rem] font-semibold tracking-[-0.01em] text-[#0F172A]">
        {email?.subject || item.email_id}
      </h1>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/inbox/${item.email_id}`)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1E293B]"
          >
            <EnvelopeSimple size={17} aria-hidden="true" />
            Go to email content
          </button>
          <p className="text-sm text-[#475569]">Received {formatDate(email?.received_at)}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/docs-comparison/${item.email_id}`)}
          className="inline-flex h-10 items-center rounded-lg border border-[#0F172A] bg-transparent px-4 text-sm font-semibold text-[#0F172A] transition-colors hover:bg-white/70"
        >
          Go to document comparison
        </button>
      </div>

      <div className="mt-6 flex gap-4 rounded-2xl border border-[#FDE68A] bg-[#FEF3C7] p-6">
        <Warning size={22} className="mt-0.5 shrink-0 text-[#B45309]" />
        <div>
          <p className="font-display font-semibold text-[#78350F]">Why this needs a human review</p>
          <p className="mt-1 text-sm leading-6 text-[#92400E]">{item.description}</p>
        </div>
      </div>
      {error && (
        <div className="mt-5">
          <BackendError error={error} compact />
        </div>
      )}

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {item.status === 'open' && <UploadMissingPanel itemId={item.id} onSaved={handleSaved} />}
          {item.status === 'open' && item.reason === 'manual_escalation' && (
            <EscalationPanel
              itemId={item.id}
              onSaved={handleSaved}
              onOpenComparison={() => navigate(`/docs-comparison/${item.email_id}`)}
            />
          )}
          {item.status === 'open' && item.reason === 'processing_failed' && (
            <RetryPanel itemId={item.id} onSaved={handleSaved} />
          )}
          {item.status === 'open' &&
            (item.reason === 'unreadable' || item.reason === 'missing_value') && (
              <ResolveIssueButton itemId={item.id} onSaved={handleSaved} />
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
            </>
          )}
          {item.status === 'resolved' && (
            <section className="rounded-2xl bg-white p-6 border border-slate-200">
              <h2 className="font-display text-lg font-semibold text-[#1E293B]">Resolution</h2>
              <pre className="mt-2 overflow-auto rounded-lg bg-[#F8FAFC] p-3 font-mono text-xs text-[#475569]">
                {JSON.stringify(item.resolution, null, 2)}
              </pre>
              <ReopenIssueButton itemId={item.id} onSaved={handleSaved} />
            </section>
          )}
        </div>
        <div className="grid gap-4">
          {flaggedFields.length > 0 && (
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#475569]">
              Evidence field
              <select
                className="mt-2 h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm normal-case disabled:cursor-not-allowed disabled:bg-[#F1F5F9]"
                value={hasAttachment ? activeField || '' : ''}
                disabled={!hasAttachment}
                onChange={(event) => setActiveField(event.target.value)}
              >
                {hasAttachment ? (
                  flaggedFields.map((field) => (
                    <option key={field} value={field}>
                      {fieldLabels[field]?.label || field}
                    </option>
                  ))
                ) : (
                  <option value="" />
                )}
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
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#0F172A] px-5 py-3 text-sm font-semibold text-white shadow-lg"
          role="status"
        >
          {notice}
        </div>
      )}
    </div>
  )
}
