import type { Address } from '../types'
import { formatAddress } from './address'

// ---------------------------------------------------------------------------
// Calendar helpers (#416, #426) — turning a game into the event both apps
// offer to put in the player's agenda: the OS's own "new event" screen on
// mobile, a downloaded .ics on the web (src/lib/ics.ts). Pure on purpose —
// everything that decides *what* the event says lives here, testable without a
// native module or a DOM, and there is one definition of it rather than two
// that drift.
//
// Shared domain logic — imported by the web app (@/lib/calendar) and the
// mobile app (@shared/lib/calendar). Keep this module free of any
// browser/RN/Node deps.
// ---------------------------------------------------------------------------

/**
 * How long a match blocks the evening — never the one hour a calendar would
 * default to. A 4-contre-4 is sixteen singles plus a double and runs about
 * three and a half hours; a 3-contre-3 is half an hour shorter. The OS screen
 * lets the player trim it before saving.
 */
function matchDurationHours(playersPerGame: number): number {
  return playersPerGame >= 4 ? 3.5 : 3
}

/**
 * Parses a match time as it is stored: "19h30", or "19h" for a round hour
 * (`Game.time`). Returns null when there is no time — a game whose slot the
 * FFTT import has not filled in yet is the normal case, not an error.
 */
export function parseGameTime(time?: string): { hours: number; minutes: number } | null {
  const m = /^\s*(\d{1,2})\s*[h:]\s*(\d{1,2})?\s*$/.exec(time ?? '')
  if (!m) return null
  const hours = Number(m[1])
  const minutes = m[2] ? Number(m[2]) : 0
  if (hours > 23 || minutes > 59) return null
  return { hours, minutes }
}

export type MatchEvent = {
  title: string
  startDate: Date
  endDate: Date
  allDay: boolean
  location?: string
  notes?: string
}

/**
 * The event to pre-fill the OS's creation screen with.
 *
 * Without a known time the event is all-day rather than pinned to an invented
 * hour: a wrong 20h00 in someone's agenda is worse than no hour at all, and the
 * player will get the real one when the club imports the schedule.
 */
export function buildMatchEvent({
  date,
  time,
  matchup,
  matchDayNumber,
  divisionLabel,
  playersPerGame,
  address,
  venueLabel,
}: {
  /** Match date, YYYY-MM-DD. */
  date: string
  /** Match time as stored, e.g. "19h30". */
  time?: string
  /** Home – away, in that order, as the match header writes it. */
  matchup: string
  matchDayNumber: number
  divisionLabel?: string
  /** Players per side, which is what sets the length of the round. */
  playersPerGame: number
  /** The venue's address, when the home club has one on file. */
  address?: Address
  /** Fallback venue text when it has no address — typically just the city. */
  venueLabel?: string
}): MatchEvent {
  const [y, m, d] = date.split('-').map(Number)
  const at = parseGameTime(time)

  const startDate = new Date(y, m - 1, d, at?.hours ?? 0, at?.minutes ?? 0)
  const endDate = at
    ? new Date(startDate.getTime() + matchDurationHours(playersPerGame) * 3_600_000)
    : new Date(y, m - 1, d, 23, 59)

  // The full address, not the header's short label: this one is what the
  // calendar hands to the maps app on the way to the match.
  const location = address
    ? [address.label, formatAddress(address)].filter(Boolean).join(', ')
    : venueLabel

  return {
    title: matchup,
    startDate,
    endDate,
    allDay: !at,
    location: location || undefined,
    notes: [`Journée ${matchDayNumber}`, divisionLabel].filter(Boolean).join(' · '),
  }
}
