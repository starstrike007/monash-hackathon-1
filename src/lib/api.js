// In local development, use Vite's same-origin `/api` proxy. This keeps the
// client working whether the app is opened at localhost or 127.0.0.1, and
// avoids a browser-side cross-origin request for every detail view.
const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || ''
const REQUEST_TIMEOUT_MS = 30_000
const PIPELINE_POLL_INTERVAL_MS = 750
const PIPELINE_WAIT_TIMEOUT_MS = 10 * 60 * 1000

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
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const headers = { ...(options.headers || {}) }
  if (options.body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json'
  }
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('The backend request timed out. Please retry.', { cause: error })
    }
    throw new ApiError('Backend unreachable. Start the FastAPI service and try again.', {
      backendUnavailable: true,
      cause: error,
    })
  } finally {
    window.clearTimeout(timeout)
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

export function getReviewCount() {
  return request('/api/review/count')
}

export function getEmails(params = {}) {
  return request(`/api/emails?${queryString(params)}`)
}

const PIPELINE_ACTIVE_STATUSES = new Set(['queued', 'running'])
let pipelineReadyPromise = null
const pipelineProgressListeners = new Set()

function publishPipelineProgress(status) {
  for (const listener of pipelineProgressListeners) {
    try {
      listener(status)
    } catch {
      // A page may unmount while the shared bootstrap is still running.
    }
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

/**
 * Start the one shared bootstrap and wait for it without making any tab GET
 * request own the full 520-email pipeline run. Multiple tabs join this same
 * promise and receive the same real progress updates.
 */
export function ensurePipelineReady({ onProgress } = {}) {
  if (onProgress) pipelineProgressListeners.add(onProgress)
  if (!pipelineReadyPromise) {
    pipelineReadyPromise = (async () => {
      let status = await startPipelineBootstrap()
      publishPipelineProgress(status)
      const deadline = Date.now() + PIPELINE_WAIT_TIMEOUT_MS

      while (PIPELINE_ACTIVE_STATUSES.has(status.status)) {
        if (Date.now() >= deadline) {
          throw new ApiError('The dashboard pipeline is taking too long. Please retry.')
        }
        await wait(PIPELINE_POLL_INTERVAL_MS)
        status = await getPipelineBootstrapStatus()
        publishPipelineProgress(status)
      }

      if (status.status === 'failed') {
        throw new ApiError(status.message || 'The dashboard pipeline failed to load.')
      }

      return status
    })().finally(() => {
      pipelineReadyPromise = null
      pipelineProgressListeners.clear()
    })
  }

  return pipelineReadyPromise
}

export function getAllEmails(params = {}, options = {}) {
  return (async () => {
    await ensurePipelineReady(options)
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

export function getEmail(emailId, options = {}) {
  return ensurePipelineReady(options).then(() => request(`/api/emails/${emailId}`))
}

export function runPipeline() {
  return request('/api/pipeline/run', { method: 'POST', body: JSON.stringify({}) })
}

export function getPipelineRun(runId) {
  return request(`/api/pipeline/runs/${runId}`)
}

export function startPipelineBootstrap() {
  // The endpoint has no request body. Omitting JSON headers keeps this
  // cross-origin POST a simple request, avoiding an extra CORS preflight.
  return request('/api/pipeline/bootstrap', { method: 'POST' })
}

export function getPipelineBootstrapStatus() {
  return request('/api/pipeline/bootstrap/status')
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

export function overrideComparisonResult(emailId, payload) {
  return request(`/api/emails/${emailId}/comparison-override`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function submissionUrl() {
  return `${API_BASE}/api/export/submission`
}

/** Fetch the evaluator-shaped submission and save it to the user's computer as a .json file. */
export async function downloadSubmission(filename = 'submission.json') {
  let response
  try {
    response = await fetch(submissionUrl())
  } catch (error) {
    throw new ApiError('Backend unreachable. Start the FastAPI service and try again.', {
      backendUnavailable: true,
      cause: error,
    })
  }
  if (!response.ok) {
    throw new ApiError(`The export failed (${response.status}).`, { status: response.status })
  }
  const submission = await response.json()
  const blob = new Blob(
    [
      `${JSON.stringify(submission, null, 2)}
`,
    ],
    { type: 'application/json' },
  )
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
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

export function getReviewItems(params = {}, options = {}) {
  return ensurePipelineReady(options).then(() => request(`/api/review/items?${queryString(params)}`))
}

export function getReviewItem(itemId, options = {}) {
  return ensurePipelineReady(options).then(() => request(`/api/review/items/${itemId}`))
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

export function escalateToHumanReview(emailId, payload = {}) {
  return request(`/api/emails/${emailId}/escalate`, {
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
