import type { Competition, Division, Group, Team } from '../types'
import { FFTT_FEDERATION_ID, federationOfDivision } from './federations'
import { poolLetterOf } from './agrScheduleDocument'

/**
 * «P. 28» — the poule a team plays in, shown next to its division badge.
 *
 * The AGR names its poules by letter (« poule A », #647): the number is what
 * is stored, the letter what is shown — « Poule A ». Which one a poule is
 * comes from its division's federation, hence the optional context; without
 * it, every poule reads as the FFTT's, as it always did.
 */
export function poolLabel(
  team: Pick<Team, 'groupId'>,
  groups: Pick<Group, 'id' | 'number' | 'divisionId'>[],
  context?: { divisions: ReadonlyArray<Pick<Division, 'id' | 'competitionId'>>; competitions: ReadonlyArray<Pick<Competition, 'id' | 'federationId'>> },
): string | undefined {
  const g = groups.find((x) => x.id === team.groupId)
  if (!g) return undefined
  const division = context?.divisions.find((d) => d.id === g.divisionId)
  const lettered = division && federationOfDivision(division, context!.competitions) !== FFTT_FEDERATION_ID
  return lettered ? `Poule ${poolLetterOf(g.number)}` : `P. ${g.number}`
}
