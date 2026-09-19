const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

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
