import type { Address, Club } from '../types'
import { hasVenueInfo, parseClubDetailXml } from './ffttClub'

/**
 * Filling an opponent's hall from FFTT (#613).
 *
 * The imports create an opponent's club with a number and a name, so an away
 * match had no place to show (#611). FFTT publishes each club's hall, but
 * blocks Cloudflare's egress: the browser reads it and hands it to
 * `POST /clubs/:id/fftt-venue`, which only ever fills a club with no address.
 *
 * The reading and the writing are passed in, so this is the rule alone —
 * which clubs to ask about, what counts as a hall, and what the run tallies.
 */

export type ClubVenue = Omit<Address, 'id' | 'isDefault'>

export interface VenueFillDeps {
  /** The club's FFTT detail XML, or null when FFTT did not answer. */
  fetchXml: (affiliationNumber: string) => Promise<string | null>
  /** Writes the hall; false when the API refused or failed. */
  write: (clubId: string, venue: ClubVenue) => Promise<boolean>
  /** Called after each club, for a progress line. */
  onProgress?: (done: number, total: number) => void
}

export interface VenueFillResult {
  /** Clubs that now have their hall. */
  filled: number
  /** FFTT answered, with no address to give. */
  noInfo: number
  /** FFTT did not answer, or the write did not land. */
  failed: number
}

/** How many FFTT requests run at once — a courtesy to a shared proxy. */
const CONCURRENCY = 4

/** The clubs worth asking about: a number to ask with, and no address yet. */
export function clubsMissingVenue(clubs: Club[]): Club[] {
  return clubs.filter((c) => !c.isArchived && !!c.affiliationNumber && (c.addresses ?? []).length === 0)
}

/** The hall a club detail describes, or null when it gives no place at all. */
export function venueFromClubDetailXml(xml: string): ClubVenue | null {
  const d = parseClubDetailXml(xml)
  if (!d || !hasVenueInfo(d)) return null
  return { label: d.venueLabel || 'Salle', street: d.street, postalCode: d.postalCode, city: d.city }
}

export async function fillVenuesFromFftt(clubs: Club[], deps: VenueFillDeps): Promise<VenueFillResult> {
  const queue = clubsMissingVenue(clubs)
  const result: VenueFillResult = { filled: 0, noInfo: 0, failed: 0 }
  let next = 0
  let done = 0

  const worker = async () => {
    while (next < queue.length) {
      const club = queue[next++]
      const xml = await deps.fetchXml(club.affiliationNumber)
      const venue = xml === null ? undefined : venueFromClubDetailXml(xml)
      if (venue === undefined) result.failed++
      else if (venue === null) result.noInfo++
      else if (await deps.write(club.id, venue)) result.filled++
      else result.failed++
      deps.onProgress?.(++done, queue.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
  return result
}
