import { mockDashboard, mockDetails, mockEmails, mockRun } from '@/lib/mockData'

const API_BASE =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!response.ok) {
    throw new Error((await response.text()) || `Request failed: ${response.status}`)
  }
  return response.json()
}

async function withFallback(operation, fallback) {
  try {
    return await operation()
  } catch (error) {
    console.warn('[ShipCheck API fallback]', error.message)
    return typeof fallback === 'function' ? fallback() : fallback
  }
}

function queryString(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  })
  return query.toString()
}

function fallbackEmails(params = {}) {
  let items = [...mockEmails]
  if (params.status) {
    const status =
      params.status.toUpperCase() === 'NO_MISMATCH' ? 'OK' : params.status.toUpperCase()
    items = items.filter((item) => item.status === status)
  }
  if (params.query) {
    const text = params.query.toLowerCase()
    items = items.filter((item) =>
      `${item.subject} ${item.sender} ${item.email_id}`.toLowerCase().includes(text),
    )
  }
  return { items, total: items.length, page: 1, page_size: items.length }
}

export function getDashboard() {
  return withFallback(() => request('/api/dashboard/summary'), mockDashboard)
}

export function getEmails(params = {}) {
  return withFallback(
    () => request(`/api/emails?${queryString(params)}`),
    () => fallbackEmails(params),
  )
}

export function getAllEmails(params = {}) {
  return withFallback(
    async () => {
      // The API caps a page at 200 items, so collect every page for the inbox.
      const pageSize = 200
      const items = []
      let page = 1
      let total = 0

      while (page <= 100) {
        const response = await request(
          `/api/emails?${queryString({ ...params, page, page_size: pageSize })}`,
        )
        const pageItems = Array.isArray(response.items) ? response.items : []
        items.push(...pageItems)
        total = Number.isFinite(response.total) ? response.total : items.length

        if (!pageItems.length || items.length >= total || pageItems.length < pageSize) break
        page += 1
      }

      return { items, total, page: 1, page_size: items.length }
    },
    () => fallbackEmails(params),
  )
}

export function getEmail(emailId) {
  return withFallback(
    () => request(`/api/emails/${emailId}`),
    () => mockDetails[emailId] || { ...mockDetails.email_417, email_id: emailId },
  )
}

export function runPipeline() {
  return withFallback(
    () => request('/api/pipeline/run', { method: 'POST', body: JSON.stringify({}) }),
    { ...mockRun, run_id: `run-${Date.now()}` },
  )
}

export function getPipelineRun(runId) {
  return withFallback(() => request(`/api/pipeline/runs/${runId}`), mockRun)
}

export function retryEmail(emailId) {
  return withFallback(
    () => request(`/api/emails/${emailId}/retry`, { method: 'POST', body: JSON.stringify({}) }),
    { email_id: emailId, run_id: mockRun.run_id, status: 'complete' },
  )
}

export function resolveEmail(emailId, payload) {
  return withFallback(
    () =>
      request(`/api/emails/${emailId}/resolve`, { method: 'POST', body: JSON.stringify(payload) }),
    () => ({
      email_id: emailId,
      saved: true,
      message: 'Review decision saved',
      result: {
        ...(mockDetails[emailId]?.result || mockDetails.email_231.result),
        status: payload.action === 'correct' ? 'OK' : 'MISMATCH',
        review_reason: null,
      },
    }),
  )
}

export function submissionUrl() {
  return `${API_BASE}/api/export/submission`
}

function relativeAttachmentPath(path) {
  return path.replace(/^attachments\//, '')
}

export function attachmentUrl(path) {
  return `${API_BASE}/api/attachments/${relativeAttachmentPath(path)}`
}

export function attachmentInlineUrl(path) {
  return `${API_BASE}/api/attachments/${relativeAttachmentPath(path)}/inline`
}

export function attachmentPageImageUrl(path, pageNumber) {
  return `${API_BASE}/api/attachments/${relativeAttachmentPath(path)}/pages/${pageNumber}`
}

export function getAttachmentView(path) {
  return request(`/api/attachments/${relativeAttachmentPath(path)}/view`)
}

export function getReviewItems(params = {}) {
  return withFallback(() => request(`/api/review/items?${queryString(params)}`), {
    items: [],
    total: 0,
    open_count: 0,
  })
}

export function getReviewItem(itemId) {
  return request(`/api/review/items/${itemId}`)
}

export function resolveReviewItem(itemId, payload) {
  return request(`/api/review/items/${itemId}/resolve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function overrideCategory(emailId, payload) {
  return request(`/api/emails/${emailId}/override`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
