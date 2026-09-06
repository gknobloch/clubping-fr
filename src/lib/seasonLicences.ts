// Whether a licensee's licence is validated for the season (#488).
//
// Shared domain logic — the web app and the mobile app both read it, so keep it
// free of any browser/RN/Node deps.
//
// The club import already knows this: it lists "Absents de la liste FFTT" in
// its own dialog and then forgets it. What that list means is that the
// federation does not (yet) hold a validated licence for those members this
// season — and a member without one may not be fielded. So it is recorded, and
// the screens say so where it matters: beside the name, and again when a
// captain puts them on a team sheet.
//
// The one subtlety is the absence of evidence. No row can equally mean "the
// club has never imported", and tagging a whole club "sans licence" because
// nobody has pressed a button would be worse than saying nothing. So the
// question is only ever answered for a club that has at least one licence on
// file for that season, which is what proves an import ran.

import type { PlayerSeasonLicence } from '../types'

/** What we can say about one licensee for one season. */
export type LicenceStatus =
  /** The federation listed their licence. */
  | 'validated'
  /** It listed the club's licences, and not theirs. */
  | 'missing'
  /** Nothing has ever been imported for this club and season — no opinion. */
  | 'unknown'

export const LICENCE_MISSING_LABEL = 'Sans licence'

/**
 * The licence question for one club, answerable only once that club has
 * imported. Build it once per screen: a team sheet asks it per line.
 */
export function clubLicences(
  rows: PlayerSeasonLicence[],
  seasonId: string | undefined,
  clubPlayerIds: readonly string[],
) {
  const ids = new Set(clubPlayerIds)
  const held = new Set(
    rows.filter((r) => r.seasonId === seasonId && ids.has(r.playerId)).map((r) => r.playerId),
  )
  // One licence on file is what distinguishes "not listed" from "never asked".
  const imported = seasonId !== undefined && held.size > 0
  return {
    imported,
    statusOf: (playerId: string): LicenceStatus =>
      !imported ? 'unknown' : held.has(playerId) ? 'validated' : 'missing',
    /** Those the last import did not list, in the order given. */
    missing: (playerIds: readonly string[]): string[] =>
      imported ? playerIds.filter((id) => !held.has(id)) : [],
  }
}
