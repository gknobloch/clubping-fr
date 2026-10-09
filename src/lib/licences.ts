// A member's licences, one per federation (#644).
//
// Shared domain logic — imported by the web app (@/lib/licences) and the mobile
// app (@shared/lib/licences). Keep this module free of any browser/RN/Node deps.
//
// The FFTT licence is `User.licenseNumber`, read and written by the imports
// and onboarding as it always was; any other federation's is in
// `User.licences` (see migration 0062 for why the two are stored apart). This
// is the one place that puts them together, so a screen asks "which licence,
// for which federation?" and never reads either field on its own.
import type { Competition, Division, Federation, FederationLicence, Team, User } from '../types'
import { FFTT_FEDERATION_ID, federationOfDivision } from './federations'

type Licensed = Pick<User, 'licenseNumber' | 'licences'>

/** Every licence a member holds, the FFTT first; blank numbers are none. */
export function licencesOf(member: Licensed): FederationLicence[] {
  const fftt = member.licenseNumber?.trim()
    ? [{ federationId: FFTT_FEDERATION_ID, number: member.licenseNumber.trim() }]
    : []
  const others = (member.licences ?? [])
    .filter((l) => l.federationId !== FFTT_FEDERATION_ID && l.number.trim())
  return [...fftt, ...others]
}

/** The member's licence number in one federation, or '' when they hold none. */
export function licenceOf(member: Licensed, federationId: string): string {
  return licencesOf(member).find((l) => l.federationId === federationId)?.number ?? ''
}

/**
 * The federation a team plays in, through its division and competition — the
 * one whose licence its match sheet, roster and line-up print.
 */
export function federationOfTeam(
  team: Pick<Team, 'divisionId'> | undefined,
  divisions: ReadonlyArray<Pick<Division, 'id' | 'competitionId'>>,
  competitions: ReadonlyArray<Pick<Competition, 'id' | 'federationId'>>,
): string {
  const division = team ? divisions.find((d) => d.id === team.divisionId) : undefined
  return federationOfDivision(division ?? {}, competitions)
}


/**
 * The label of a licence row on a member's sheet: « Licence » while the FFTT is
 * the only federation there is — what the sheet always said — and « Licence
 * AGR » once there is another.
 */
export function licenceLabel(
  federationId: string,
  /** Absent — a payload predating #643 — reads as the FFTT alone. */
  federations: ReadonlyArray<Pick<Federation, 'id' | 'shortName'>> | undefined,
): string {
  if (!federations || federations.length <= 1) return 'Licence'
  return `Licence ${federations.find((f) => f.id === federationId)?.shortName ?? federationId.toUpperCase()}`
}
