// Deterministic local ids for teams and games (#282).
//
// These are DERIVED, not hashed. The issue asked for a hash of the identifying
// columns; a readable composite is used instead for one reason: the same id
// has to be produced by this TypeScript and by the SQL of a migration, and two
// independent implementations of a hash that must agree byte-for-byte on a
// PRIMARY KEY is a correctness risk with no upside. A composite is trivially
// identical in both languages, and debuggable when something looks wrong.
//
// Determinism is the point: the FFTT import and the PDF schedule import land
// on the same id for the same team, so re-importing matches the existing row
// instead of creating the duplicate that #282 had to clean up.
//
// Derived AT CREATION and never recomputed. `number` and `phaseId` are
// editable, so an id can stop matching its own columns — that is deliberate.
// Recomputing would mean renaming a primary key referenced by games,
// game_selections and the groups.team_ids JSON array, which is the operation
// that broke this project's production twice (see migrations 0016-0020).

/** Strip a known prefix so the derived id stays short and readable. */
const strip = (value: string, prefix: string) =>
  value.startsWith(prefix) ? value.slice(prefix.length) : value

/**
 * Local club id from an FFTT affiliation number: `club-fftt-<8 digits>`, or
 * null when the number is not exactly 8 digits (#275).
 *
 * Lives here rather than next to the rest of the club import (#285): that
 * module parses XML with DOMParser, and the API — which needs this id — runs
 * in a worker with no DOM. Pulling the browser module into a worker-typed
 * project to reach three lines of string handling is the wrong dependency.
 */
export function clubIdFromAffiliation(affiliationNumber: string | undefined): string | null {
  const n = (affiliationNumber ?? '').trim()
  return /^\d{8}$/.test(n) ? `club-fftt-${n}` : null
}

/**
 * Local team id: `team-<club>-<phase>-<number>`, e.g.
 * `team-06680011-27-1-3` for club-fftt-06680011, phase-27-1, team 3.
 *
 * Unique as long as (club, phase, number) is — which migration 0030 makes
 * true and the app keeps true by matching on the same triple before insert.
 */
export function teamIdFor(clubId: string, phaseId: string, number: number | string): string {
  return `team-${strip(clubId, 'club-fftt-')}-${strip(phaseId, 'phase-')}-${number}`
}

/**
 * Local game id: `game-<matchDay>-<home>-<away>`, with the `team-` prefix
 * dropped from both sides so the result stays legible.
 * `(matchDayId, homeTeamId, awayTeamId)` is unique in practice — two teams
 * meet at most once per journée.
 */
export function gameIdFor(matchDayId: string, homeTeamId: string, awayTeamId: string): string {
  return `game-${strip(matchDayId, 'md-')}-${strip(homeTeamId, 'team-')}-${strip(awayTeamId, 'team-')}`
}

// ---------------------------------------------------------------------------
// Home-game date (#287)
// ---------------------------------------------------------------------------

const DAY_INDEX: Record<string, number> = {
  Dimanche: 0, Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6,
}

/**
 * Move an FFTT fixture date back to the team's own playing day (#287).
 *
 * FFTT publishes a nominal date — usually the weekend — but a club that plays
 * midweek plays the preceding occurrence of its day: a fixture dated
 * Sunday 20 September for a Thursday team is played Thursday 17 September.
 *
 * Only ever moves BACKWARDS, never past a week, and only for the HOME team:
 * an away game is played at the opponent's venue on the opponent's day, so it
 * keeps the FFTT date. A team with no default day, an unrecognized one, or one
 * that already matches the fixture, is returned unchanged.
 */
export function homeGameDate(ffttDate: string, defaultDay: string | undefined): string {
  const target = DAY_INDEX[(defaultDay ?? '').trim()]
  if (target === undefined) return ffttDate
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ffttDate)) return ffttDate
  // Parsed as UTC so the weekday never shifts with the runtime's timezone.
  const d = new Date(`${ffttDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ffttDate
  const delta = (d.getUTCDay() - target + 7) % 7
  if (delta === 0) return ffttDate
  d.setUTCDate(d.getUTCDate() - delta)
  return d.toISOString().slice(0, 10)
}
