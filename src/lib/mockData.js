import { FIELDS, STATUS } from '@/lib/types'

const detailFields = (overrides = {}) =>
  FIELDS.map(({ key, label, unit }) => ({
    field_name: key,
    si: {
      field_name: key,
      state: 'found',
      raw_value:
        key === 'container_count'
          ? '3 x 40HC'
          : key === 'gross_weight_kg'
            ? '22,000 KGS'
            : overrides[key]?.si || 'Meridian Pulp Sdn Bhd',
      normalized_value:
        overrides[key]?.siNormalized ||
        (key === 'container_count' ? '3' : key === 'gross_weight_kg' ? '22000' : key.toUpperCase()),
      source: 'rule',
      confidence: 'high',
      evidence: { snippet: `${label}: ${overrides[key]?.si || 'Source value'}` },
    },
    bl: {
      field_name: key,
      state: overrides[key]?.state || 'found',
      raw_value:
        overrides[key]?.bl ||
        (key === 'container_count'
          ? '4 x 40HC'
          : key === 'gross_weight_kg'
            ? '22,000 KG'
            : 'Meridian Pulp Sdn Bhd'),
      normalized_value:
        overrides[key]?.blNormalized ||
        (key === 'container_count' ? '4' : key === 'gross_weight_kg' ? '22000' : key.toUpperCase()),
      source: overrides[key]?.source || 'rule',
      confidence: overrides[key]?.confidence || 'high',
      evidence: { snippet: `${label}: ${overrides[key]?.bl || 'Source value'}` },
    },
    state: overrides[key]?.result || 'match',
    result: overrides[key]?.result || 'match',
  }))

const mismatchResult = {
  email_id: 'email_417',
  run_id: 'mock-run',
  category: 'BL_COMPARISON',
  status: STATUS.MISMATCH,
  review_reason: null,
  has_defect: true,
  defect_fields: ['container_count'],
  skipped_fields: [],
  comparisons: detailFields({
    container_count: { result: 'mismatch', bl: '4 x 40HC', blNormalized: '4' },
  }),
  documents: [
    {
      role: 'SI',
      path: 'attachments/email_417_SI.txt',
      document_type: 'Shipping Instruction',
      readable: true,
    },
    {
      role: 'BL',
      path: 'attachments/email_417_BL.txt',
      document_type: 'Bill of Lading',
      readable: true,
    },
  ],
  decision_notes: [
    'Document comparison — keywords and two attachments',
    '7 of 7 fields found on both documents',
  ],
}

const reviewResult = {
  email_id: 'email_231',
  run_id: 'mock-run',
  category: 'BL_COMPARISON',
  status: STATUS.NEEDS_REVIEW,
  review_reason: 'unreadable',
  has_defect: null,
  defect_fields: [],
  skipped_fields: ['gross_weight_kg'],
  comparisons: detailFields({
    gross_weight_kg: {
      result: 'skipped',
      state: 'uncertain',
      bl: '22,600 ?',
      blNormalized: '22600',
      source: 'vision',
      confidence: 'low',
    },
  }),
  documents: [
    {
      role: 'SI',
      path: 'attachments/email_231_SI.txt',
      document_type: 'Shipping Instruction',
      readable: true,
    },
    {
      role: 'BL',
      path: 'attachments/email_231_BL.pdf',
      document_type: 'Bill of Lading',
      readable: false,
    },
  ],
  decision_notes: [
    'BL is a scan, so the vision fallback was used.',
    '6 fields match; gross weight skipped, not treated as a mismatch',
  ],
}

const subjects = [
  [
    'email_417',
    'Please check draft BL against SI — MV Orient Star',
    'cs.desk@harbourline.example',
    'BL_COMPARISON',
    STATUS.MISMATCH,
    'Container count · SI 3 / BL 4',
  ],
  [
    'email_231',
    'BL draft for verification (vessel TBC)',
    'docs@harbourline.example',
    'BL_COMPARISON',
    STATUS.NEEDS_REVIEW,
    'Gross weight · scan unclear',
  ],
  [
    'email_308',
    'SI + draft BL — booking 88213',
    'ops@meridian.example',
    'BL_COMPARISON',
    STATUS.OK,
    'No mismatch detected',
  ],
  [
    'email_102',
    'Invoice query — payment terms',
    'accounts@harbourline.example',
    'INVOICE_QUERY',
    null,
    'Classified only',
  ],
  [
    'email_199',
    'SI vs BL check',
    'cs.desk@harbourline.example',
    'BL_COMPARISON',
    STATUS.MISMATCH,
    'Gross weight, consignee',
  ],
  [
    'email_350',
    'Draft BL — please confirm',
    'docs@harbourline.example',
    'BL_COMPARISON',
    STATUS.NEEDS_REVIEW,
    'No BL attached',
  ],
  [
    'email_455',
    'New SI request: 2 x 40HC to Rotterdam',
    'booking@meridian.example',
    'SI_REQUEST',
    null,
    'Classified only',
  ],
  [
    'email_364',
    'Check BL vs SI, urgent',
    'ops@meridian.example',
    'BL_COMPARISON',
    STATUS.OK,
    'No mismatch detected',
  ],
  [
    'email_089',
    'You have been selected for a reward',
    'noreply@promo.example',
    'SPAM',
    null,
    'Classified only',
  ],
  [
    'email_276',
    'Weekly vessel schedule update',
    'schedules@harbourline.example',
    'GENERAL',
    null,
    'Classified only',
  ],
]

export const mockEmails = subjects.map(
  ([email_id, subject, sender, category, status, attention]) => ({
    email_id,
    display_id: `EM-${email_id.split('_')[1]}`,
    subject,
    sender,
    category,
    status,
    review_reason:
      status === STATUS.NEEDS_REVIEW
        ? attention.includes('attach')
          ? 'missing_attachment'
          : 'unreadable'
        : null,
    attention,
    attachments: [],
  }),
)

export const mockDashboard = {
  emails_processed: 520,
  comparison_requests: 126,
  mismatches_found: 41,
  needs_review: 14,
  categories: { BL_COMPARISON: 126, SI_REQUEST: 96, INVOICE_QUERY: 88, GENERAL: 132, SPAM: 78 },
  outcomes: { OK: 71, MISMATCH: 41, NEEDS_REVIEW: 14 },
  defects_by_field: {
    gross_weight_kg: 12,
    container_count: 10,
    consignee: 8,
    notify_party: 6,
    port_of_discharge: 5,
    shipper: 3,
    port_of_loading: 2,
  },
  attention: mockEmails.filter((item) => item.status === STATUS.NEEDS_REVIEW),
  latest_run_id: 'mock-run',
  last_run_at: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
}

export const mockDetails = {
  email_417: {
    ...mockEmails[0],
    body: 'Please check the draft BL against the SI and confirm the details.',
    result: mismatchResult,
  },
  email_231: {
    ...mockEmails[1],
    body: 'Attached are the SI and draft BL for verification.',
    result: reviewResult,
  },
}

export const mockRun = {
  run_id: 'mock-run',
  status: 'complete',
  finished_at: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
  total_emails: 520,
  summary: { BL_COMPARISON: 126, OK: 71, MISMATCH: 41, NEEDS_REVIEW: 14 },
  stages: [
    {
      stage_number: 1,
      stage_name: 'Classify',
      status: 'complete',
      processed_count: 520,
      total_count: 520,
      failed_count: 0,
      review_count: 0,
    },
    {
      stage_number: 2,
      stage_name: 'Extract & normalize',
      status: 'partial',
      processed_count: 123,
      total_count: 124,
      failed_count: 1,
      review_count: 2,
      details: { failure: 'OpenAI vision request timed out on BL page 1' },
    },
    {
      stage_number: 3,
      stage_name: 'Compare',
      status: 'complete',
      processed_count: 112,
      total_count: 112,
      failed_count: 0,
      review_count: 11,
    },
    {
      stage_number: 4,
      stage_name: 'Decide',
      status: 'complete',
      processed_count: 126,
      total_count: 126,
      failed_count: 0,
      review_count: 14,
    },
  ],
  failures: [
    {
      email_id: 'email_231',
      message: 'OpenAI vision request timed out on BL page 1',
      retryable: true,
    },
  ],
}
