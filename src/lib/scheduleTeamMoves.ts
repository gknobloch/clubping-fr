/**
 * The teams a calendar import would take out of another poule (#763).
 *
 * A team is (club, phase, number), and its id is derived from those (#282):
 * importing a calendar into the right poule after a wrong one finds the same
 * rows again. They have to move — `group_id`, the old poule's composition, and
 * their fixtures there, by #422's rule — or they stay listed in both and keep
 * pointing at the poule they never played in.
 *
 * Shared by the review, which says it before importing, and the API, which
 * does it once the review has confirmed. No database, no DOM.
 */

/** A team as both sides know it: where it sits in its phase. */
export interface PlacedTeam {
  id: string
  clubId: string
  number: number
  /** Its poule — '' for a team in none. */
  groupId: string
}

/** A side the calendar names, its club resolved. */
export interface ScheduleSide {
  clubId: string
  number: number
}

/**
 * The phase's teams the calendar names that sit in a poule other than
 * `targetGroupId` — `null` when the poule is still to be created, where every
 * team found again is somewhere else. A team in no poule is not leaving one.
 */
export function teamsLeavingTheirPoule(
  sides: readonly ScheduleSide[],
  phaseTeams: readonly PlacedTeam[],
  targetGroupId: string | null,
): PlacedTeam[] {
  const named = new Set(sides.map((s) => `${s.clubId}|${s.number}`))
  return phaseTeams.filter((t) => named.has(`${t.clubId}|${t.number}`) && !!t.groupId && t.groupId !== targetGroupId)
}
