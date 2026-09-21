export const STATUS = {
  OK: 'OK',
  MISMATCH: 'MISMATCH',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
}

export const STATUS_LABELS = {
  OK: 'No mismatch',
  MISMATCH: 'Mismatch',
  NEEDS_REVIEW: 'Needs review',
}

export const CATEGORY_LABELS = {
  BL_COMPARISON: 'Document comparison',
  SI_REQUEST: 'New SI request',
  INVOICE_QUERY: 'Invoice query',
  GENERAL: 'General',
  SPAM: 'Spam',
}

export const FIELDS = [
  { key: 'shipper', label: 'Shipper' },
  { key: 'consignee', label: 'Consignee' },
  { key: 'notify_party', label: 'Notify party' },
  { key: 'port_of_loading', label: 'Port of loading' },
  { key: 'port_of_discharge', label: 'Port of discharge' },
  { key: 'container_count', label: 'Container count' },
  { key: 'gross_weight_kg', label: 'Gross weight', unit: 'kg' },
]

export function statusLabel(status) {
  return STATUS_LABELS[status] || 'Not applicable'
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category || 'Unclassified'
}

export { formatBusinessDate as formatDate } from './time'
