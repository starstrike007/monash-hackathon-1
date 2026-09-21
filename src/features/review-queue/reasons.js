export const REASON_LABELS = {
  unreadable: 'Unreadable',
  missing_attachment: 'Missing attachment',
  missing_value: 'Missing value',
  wrong_doc_type: 'Wrong document type',
  processing_failed: 'Processing failed',
  manual_escalation: 'Escalated',
}

export function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason
}
