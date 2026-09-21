const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const BUSINESS_TIME_ZONE = 'Asia/Kuala_Lumpur'

function plural(count, unit) {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

/** Human relative time: "just now", "59 mins ago", "3 hours ago", "2 days ago". */
export function relativeTime(value, now = Date.now()) {
  if (!value) return null
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return null

  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < MINUTE) return 'just now'
  if (seconds < HOUR) return plural(Math.floor(seconds / MINUTE), 'min')
  if (seconds < DAY) return plural(Math.floor(seconds / HOUR), 'hour')
  if (seconds < 7 * DAY) return plural(Math.floor(seconds / DAY), 'day')
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function dateParts(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
}

export function businessDateKey(value) {
  const parts = dateParts(value)
  if (!parts) return null
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return `${values.year}-${values.month}-${values.day}`
}

export function formatBusinessDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** Split display for list rows: { date: "21 Sep 2026", time: "13:13" }. */
export function formatBusinessDateTimeParts(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return {
    date: new Intl.DateTimeFormat('en-GB', {
      timeZone: BUSINESS_TIME_ZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('en-GB', {
      timeZone: BUSINESS_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date),
  }
}

export function formatBusinessDay(value = Date.now()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'â€”'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Earlier']

/** Inbox-style period heading for a timestamp, by Kuala Lumpur calendar days. */
export function groupFor(receivedAt, now) {
  if (!receivedAt) return 'Earlier'
  const today = businessDateKey(now)
  const received = businessDateKey(receivedAt)
  if (!today || !received) return 'Earlier'
  const diffDays = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${received}T00:00:00Z`)) / 86400000,
  )
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays <= 6) return 'This week'
  if (diffDays <= 29) return 'This month'
  return 'Earlier'
}
