// The « Organisation » filter of Divisions and Groupes (#237, #692).
//
// It used to ask the FFTT which divisions an organisation runs. Since #692 a
// division records its organisation — the FFTT divisions import writes the
// one it ran for, the AGR calendar import the one chosen —, so the filter
// reads our own data wherever it can: always for a federation without an API
// (the AGR's Haut-Rhin and Bas-Rhin), and for the FFTT once every division of
// the phase knows its organisation. Divisions imported before #692 learn it
// from their next import; until then the FFTT is still asked.
import type { Division, Organization } from '../types'
import { FFTT_FEDERATION_ID } from './federations'

/** Whether this phase's divisions can be filtered from our data alone. */
export function filtersLocally(
  phaseDivisions: ReadonlyArray<Pick<Division, 'organizationId'>>, federationId: string,
): boolean {
  if (federationId !== FFTT_FEDERATION_ID) return true
  return phaseDivisions.length > 0 && phaseDivisions.every((d) => !!d.organizationId)
}

/**
 * The organisations to offer, when filtering locally: a federation without an
 * API offers all of its own; the FFTT, those its divisions name.
 */
export function localOrganizationOptions(
  organizations: readonly Organization[],
  phaseDivisions: ReadonlyArray<Pick<Division, 'organizationId'>>,
  federationId: string,
): Organization[] {
  const own = organizations
    .filter((o) => (o.federationId ?? FFTT_FEDERATION_ID) === federationId)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  if (federationId !== FFTT_FEDERATION_ID) return own
  const named = new Set(phaseDivisions.map((d) => d.organizationId))
  return own.filter((o) => named.has(o.id))
}

/** The divisions an organisation runs, from our data. */
export function divisionIdsOfOrganization(
  divisions: ReadonlyArray<Pick<Division, 'id' | 'organizationId'>>, organizationId: string,
): Set<string> {
  return new Set(divisions.filter((d) => d.organizationId === organizationId).map((d) => d.id))
}
