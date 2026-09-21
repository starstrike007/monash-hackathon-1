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
