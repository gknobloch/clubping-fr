import type { Competition, Division, Group, Team } from '../types'
import { FFTT_FEDERATION_ID, federationOfDivision } from './federations'
import { poolLetterOf } from './agrScheduleDocument'

type PoolContext = {
  divisions: ReadonlyArray<Pick<Division, 'id' | 'competitionId'>>
  competitions: ReadonlyArray<Pick<Competition, 'id' | 'federationId'>>
}

/**
 * Whether a division's federation names its poules by letter: the AGR does
 * (« poule A », #647), the FFTT numbers them. The number is what is stored.
 */
export function isLetteredDivision(
  division: Pick<Division, 'competitionId'>,
  competitions: PoolContext['competitions'],
): boolean {
  return federationOfDivision(division, competitions) !== FFTT_FEDERATION_ID
}

/**
 * A poule's own name — « A » at the AGR, « 28 » at the FFTT — for wherever a
 * poule is listed or picked (#696). Without context it is the number, as it
 * always was.
 */
export function poolName(group: Pick<Group, 'number' | 'divisionId'>, context?: PoolContext): string {
  const division = context?.divisions.find((d) => d.id === group.divisionId)
  return division && isLetteredDivision(division, context!.competitions)
    ? poolLetterOf(group.number) : String(group.number)
}

/** « Poule A » at the AGR, « Groupe 28 » at the FFTT — a poule named on its own. */
export function poolTitle(group: Pick<Group, 'number' | 'divisionId'>, context?: PoolContext): string {
  const division = context?.divisions.find((d) => d.id === group.divisionId)
  return division && isLetteredDivision(division, context!.competitions)
    ? `Poule ${poolLetterOf(group.number)}` : `Groupe ${group.number}`
}

/**
 * «P. 28» — the poule a team plays in, shown next to its division badge;
 * « Poule A » for a federation that letters them.
 */
export function poolLabel(
  team: Pick<Team, 'groupId'>,
  groups: Pick<Group, 'id' | 'number' | 'divisionId'>[],
  context?: PoolContext,
): string | undefined {
  const g = groups.find((x) => x.id === team.groupId)
  if (!g) return undefined
  const division = context?.divisions.find((d) => d.id === g.divisionId)
  return division && isLetteredDivision(division, context!.competitions)
    ? `Poule ${poolLetterOf(g.number)}` : `P. ${g.number}`
}

/**
 * The poule as a match's badge names it in the app (#716): the letter alone at
 * the AGR — « A » beside « Exc. » needs no word —, «P. 28» at the FFTT. A
 * match's badge row (journée, division, poule, équipe, compte à rebours) did
 * not fit a phone with « Poule A » in it. The web keeps `poolLabel`.
 */
export function poolBadge(
  team: Pick<Team, 'groupId'>,
  groups: Pick<Group, 'id' | 'number' | 'divisionId'>[],
  context?: PoolContext,
): string | undefined {
  const g = groups.find((x) => x.id === team.groupId)
  if (!g) return undefined
  return /^\d+$/.test(poolName(g, context)) ? `P. ${g.number}` : poolName(g, context)
}
