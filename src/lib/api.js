const API_BASE =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export function notifyDataChanged() {
  window.dispatchEvent(new CustomEvent('clearance:data-changed'))
}

export class ApiError extends Error {
  constructor(message, { status = null, backendUnavailable = false, cause = null } = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.backendUnavailable = backendUnavailable
  }
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    })
  } catch (error) {
    throw new ApiError(
      'Backend unreachable. Start the FastAPI service and try again.',
      { backendUnavailable: true, cause: error },
    )
  }
  if (!response.ok) {
    let detail = ''
    try {
      detail = await response.text()
    } catch {
      detail = ''
    }
    throw new ApiError(detail || `Request failed: ${response.status}`, { status: response.status })
  }
  try {
    return await response.json()
  } catch (error) {
    throw new ApiError('The backend returned an invalid response.', { cause: error })
  }
}

function queryString(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  })
  return query.toString()
}

export function getDashboard() {
  return request('/api/dashboard/summary')
}

export function getEmails(params = {}) {
  return request(`/api/emails?${queryString(params)}`)
}

export function getAllEmails(params = {}) {
  return (async () => {
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
  })()
}

export function getEmail(emailId) {
  return request(`/api/emails/${emailId}`)
}

export function runPipeline() {
  return request('/api/pipeline/run', { method: 'POST', body: JSON.stringify({}) })
}

export function getPipelineRun(runId) {
  return request(`/api/pipeline/runs/${runId}`)
}

export function retryEmail(emailId) {
  return request(`/api/emails/${emailId}/retry`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function resolveEmail(emailId, payload) {
  return request(`/api/emails/${emailId}/resolve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
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
  return request(`/api/review/items?${queryString(params)}`)
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

export function uploadReviewAttachment(itemId, payload) {
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
