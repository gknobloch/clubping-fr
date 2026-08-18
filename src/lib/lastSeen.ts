/**
 * Rendering `User.lastSeenAt` for the people who administer a club (#406).
 *
 * The question this answers is "has this member opened the app, and recently?",
 * not "at what time". So the near past is relative — a club admin reads
 * "Il y a 3 jours" without doing arithmetic — and only once a visit is old
 * enough to be a fact rather than news does it become a date.
 *
 * Two phrasings, because the two places it appears carry different context.
 * The desktop table has a «Dernière visite» column header, so the cell is bare.
 * A mobile card has no header: the visit sits on the same line as the licence
 * number, where "Il y a 3 jours" would be three days since *something*. There
 * it is a short sentence instead — see `lastSeenSentence`.
 */

export const NEVER_LABEL = 'Jamais'
export const NEVER_SENTENCE = 'Jamais connecté'

const DAY_MS = 24 * 60 * 60 * 1000

/** Midnight local time, so "Hier" means yesterday's date, not 24 hours ago. */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** How long ago a visit was, in the units the labels are written in. */
type Visit =
  | { kind: 'never' }
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'days'; n: number }
  | { kind: 'weeks'; n: number }
  | { kind: 'date'; on: Date }

/**
 * `undefined` covers both halves of what the API sends: a member who has never
 * signed in, and a member whose visit the caller is not entitled to see. On the
 * screens that render this, only the first is possible — see `lastSeenAt` in
 * src/types.
 */
function visitFrom(iso: string | undefined, now: Date): Visit {
  if (!iso) return { kind: 'never' }
  const seen = new Date(iso)
  if (Number.isNaN(seen.getTime())) return { kind: 'never' }

  const days = Math.round((startOfDay(now) - startOfDay(seen)) / DAY_MS)
  // Negative means the stored visit is in the future — a clock disagreeing with
  // ours, not a member ahead of time. Reading it as "today" is the one answer
  // that is never absurd.
  if (days <= 0) return { kind: 'today' }
  if (days === 1) return { kind: 'yesterday' }
  if (days < 7) return { kind: 'days', n: days }
  if (days < 28) return { kind: 'weeks', n: Math.floor(days / 7) }
  return { kind: 'date', on: seen }
}

const frenchDate = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * A member's last visit, for a column that already says what it is.
 *
 * `now` is injectable so the tests do not depend on the day they run.
 */
export function formatLastSeen(iso: string | undefined, now: Date = new Date()): string {
  const visit = visitFrom(iso, now)
  switch (visit.kind) {
    case 'never': return NEVER_LABEL
    case 'today': return "Aujourd'hui"
    case 'yesterday': return 'Hier'
    case 'days': return `Il y a ${visit.n} jours`
    case 'weeks': return `Il y a ${visit.n} semaine${visit.n > 1 ? 's' : ''}`
    case 'date': return frenchDate(visit.on)
  }
}

/** The same visit, phrased to stand on its own next to other card details. */
export function lastSeenSentence(iso: string | undefined, now: Date = new Date()): string {
  const visit = visitFrom(iso, now)
  switch (visit.kind) {
    case 'never': return NEVER_SENTENCE
    case 'today': return "Vu aujourd'hui"
    case 'yesterday': return 'Vu hier'
    case 'days': return `Vu il y a ${visit.n} jours`
    case 'weeks': return `Vu il y a ${visit.n} semaine${visit.n > 1 ? 's' : ''}`
    case 'date': return `Vu le ${frenchDate(visit.on)}`
  }
}

/** Whether a member has ever opened the app, as far as the reader can tell. */
export const hasVisited = (lastSeenAt: string | undefined): boolean => !!lastSeenAt
