import { mockDashboard, mockDetails, mockEmails, mockRun } from '@/lib/mockData'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

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

export function getDashboard() {
  return withFallback(() => request('/api/dashboard/summary'), mockDashboard)
}

export function getEmails(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => value && query.set(key, value))
  return withFallback(
    () => request(`/api/emails?${query.toString()}`),
    () => {
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
      return { items, total: items.length, page: 1, page_size: 50 }
    },
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

export function attachmentUrl(path) {
  const relativePath = path.replace(/^attachments\//, '')
  return `${API_BASE}/api/attachments/${relativePath}`
}
