/**
 * Rendering `User.lastSeenAt` for the people who administer a club (#406).
 *
 * The question this answers is "has this member opened the app, and recently?",
 * not "at what time". So the near past is relative — a club admin reads
 * "Il y a 3 jours" without doing arithmetic — and only once a visit is old
 * enough to be a fact rather than news does it become a date.
 */

export const NEVER_LABEL = 'Jamais'

const DAY_MS = 24 * 60 * 60 * 1000

/** Midnight local time, so "Hier" means yesterday's date, not 24 hours ago. */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/**
 * A French label for a member's last visit.
 *
 * `undefined` covers both halves of what the API sends: a member who has never
 * signed in, and a member whose visit the caller is not entitled to see. On the
 * one screen that renders this, only the first is possible — see `lastSeenAt`
 * in src/types.
 *
 * `now` is injectable so the tests do not depend on the day they run.
 */
export function formatLastSeen(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return NEVER_LABEL
  const seen = new Date(iso)
  if (Number.isNaN(seen.getTime())) return NEVER_LABEL

  const days = Math.round((startOfDay(now) - startOfDay(seen)) / DAY_MS)
  // Negative means the stored visit is in the future — a clock disagreeing with
  // ours, not a member ahead of time. Reading it as "today" is the one answer
  // that is never absurd.
  if (days <= 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days} jours`
  if (days < 28) {
    const weeks = Math.floor(days / 7)
    return `Il y a ${weeks} semaine${weeks > 1 ? 's' : ''}`
  }
  return seen.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Whether a member has ever opened the app, as far as the reader can tell. */
export const hasVisited = (lastSeenAt: string | undefined): boolean => !!lastSeenAt
