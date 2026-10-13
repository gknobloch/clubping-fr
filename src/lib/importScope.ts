import type { Competition, Division, Group, Team } from '@/types'
import { FFTT_FEDERATION_ID, federationOfDivision } from './federations'

/**
 * Groups of a phase whose FFTT calendar is worth offering to import (#287).
 *
 * A group qualifies when it holds at least one team that the user actually
 * cares about: their own club's when they are club-scoped, anyone's when they
 * are a general admin. Counting any team regardless of club listed pools the
 * club has nothing to do with — a club admin was shown "Nationale 3 Messieurs
 * · Poule 1" with nothing to import.
 *
 * Archived teams never count: an archived entry is not a reason to fetch a
 * calendar. Nor does a division of another federation (#660): the FFTT has no
 * calendar for an AGR poule.
 */
export function importableGroupIds(
  { phaseId, divisions, competitions, groups, teams, clubId }: {
    phaseId: string
    divisions: Division[]
    competitions: ReadonlyArray<Pick<Competition, 'id' | 'federationId'>>
    groups: Group[]
    teams: Team[]
    /** The club to scope to; omit for a general admin (no scope). */
    clubId?: string
  },
): string[] {
  if (!phaseId) return []
  const divIds = new Set(
    divisions
      .filter((d) => d.phaseId === phaseId && federationOfDivision(d, competitions) === FFTT_FEDERATION_ID)
      .map((d) => d.id),
  )
  const populated = new Set(
    teams.filter((t) => !t.isArchived && (!clubId || t.clubId === clubId)).map((t) => t.groupId),
  )
  return groups.filter((g) => divIds.has(g.divisionId) && populated.has(g.id)).map((g) => g.id)
}
