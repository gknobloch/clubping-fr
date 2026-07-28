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
