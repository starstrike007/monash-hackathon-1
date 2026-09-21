import { FIELDS } from '@/lib/types'

const fieldLabels = Object.fromEntries(FIELDS.map((field) => [field.key, field]))

const REASON_LABELS = {
  wrong_doc_type: 'wrong document type',
  missing_attachment: 'missing attachment',
  unreadable: 'unreadable document',
  missing_value: 'missing value',
}

/** One-line, state-aware summary for a comparison result: no mismatch,
 * N of 7 fields differ (with the first mismatch as an example when the full
 * `comparisons` array is available), or needs review with its reason - used
 * by both the list (lighter item shape) and the detail banner (full result). */
export function summarizeComparison(result) {
  if (!result || !result.status) {
    return { tone: 'review', text: 'Not yet processed' }
  }
  if (result.status === 'OK') {
    return { tone: 'ok', text: 'No mismatch detected' }
  }
  if (result.status === 'MISMATCH') {
    const count = result.defect_fields?.length || 0
    const firstKey = result.defect_fields?.[0]
    const comparison = result.comparisons?.find((item) => item.field_name === firstKey)
    const label = fieldLabels[firstKey]?.label || firstKey
    const detail = comparison
      ? `${label} SI ${comparison.si?.raw_value ?? '—'} / BL ${comparison.bl?.raw_value ?? '—'}`
      : null
    return {
      tone: 'mismatch',
      text: `${count} of 7 field${count === 1 ? '' : 's'} differ${detail ? `: ${detail}` : ''}`,
    }
  }
  if (result.status === 'NEEDS_REVIEW') {
    return {
      tone: 'review',
      text: `Needs review: ${REASON_LABELS[result.review_reason] || result.review_reason || 'unresolved'}`,
    }
  }
  return { tone: 'review', text: 'Not applicable' }
}

export { fieldLabels }
