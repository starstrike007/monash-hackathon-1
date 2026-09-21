import { useLayoutEffect } from 'react'

const VISITED_EMAILS_STORAGE_KEY = 'clearance:visited-email-ids'

/** Emails opened before, shared by every email list so a visited row looks the same everywhere. */
export function readVisitedEmailIds() {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = JSON.parse(window.localStorage.getItem(VISITED_EMAILS_STORAGE_KEY) || '[]')
    return new Set(Array.isArray(stored) ? stored : [])
  } catch {
    return new Set()
  }
}

export function persistVisitedEmailIds(emailIds) {
  try {
    window.localStorage.setItem(VISITED_EMAILS_STORAGE_KEY, JSON.stringify([...emailIds]))
  } catch {
    // Browsers may block storage; the in-memory state still provides feedback for this visit.
  }
}

/** JSON in sessionStorage; passing null removes the key. Failures are ignored on purpose. */
export function writeSession(key, value) {
  try {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage may be blocked; the list still works, it just won't remember its view.
  }
}

export function readSession(key) {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

/** Remember where a row sits on screen so the list can put it back after an email is opened. */
export function saveScrollAnchor(key, emailId, row) {
  writeSession(key, { emailId, top: row.getBoundingClientRect().top })
}

/**
 * After returning from an email, scroll so its row is back at the same screen position.
 * Pass `ready` once the rows are rendered; before that the page is too short to scroll.
 * The saved anchor is used once, so a later fresh visit starts at the top.
 */
export function useRestoreScroll(key, ready) {
  useLayoutEffect(() => {
    if (!ready) return
    const anchor = readSession(key)
    if (!anchor) return
    writeSession(key, null)
    const row = document.querySelector(`[data-email-id="${anchor.emailId}"]`)
    if (!row) return
    window.scrollTo(0, window.scrollY + row.getBoundingClientRect().top - anchor.top)
  }, [key, ready])
}
