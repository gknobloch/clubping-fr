// Which federation a page is about, and that federation's phases (#645).
//
// Shared domain logic — imported by the web app (@/lib/phaseScope) and the
// mobile app (@shared/lib/phaseScope). Keep this module free of any
// browser/RN/Node deps.
//
// Each federation has its seasons and its active phase, so a page that pages
// through phases first needs the federation: Kembs's FFTT phase 1 and its AGR
// phase 1 are two phases, with two Kembs 1. The federation comes first, then
// the phase — and a club of one federation is never asked.
import type { Club, Federation, Phase, Season } from '../types'
import { FFTT_FEDERATION_ID, federationChoices, phasesOfFederation } from './federations'
import { defaultPhase, orderPhases } from './phases'

export interface PhaseScope<F> {
  /** What the switch offers: the club's federations, or every one when no club narrows it. */
  options: F[]
  /** The one in force: the chosen one when offered, else the first offered, else the FFTT. */
  federationId: string
  /** Its phases, oldest first — what « phase précédente / suivante » pages through. */
  phases: Phase[]
  /** The phase the page opens on in that federation: its active one, else its newest. */
  defaultPhase: Phase | undefined
}

export function phaseScope<F extends Pick<Federation, 'id'>>({
  federations, seasons, phases, club, chosen,
}: {
  federations: ReadonlyArray<F>
  seasons: ReadonlyArray<Pick<Season, 'id' | 'federationId'>>
  phases: Phase[]
  /** The club in view — absent for a general admin, who sees every federation. */
  club?: Pick<Club, 'affiliationNumber' | 'affiliations'>
  chosen?: string
}): PhaseScope<F> {
  const options = federationChoices(federations, club)
  const federationId = chosen && options.some((f) => f.id === chosen)
    ? chosen
    : options[0]?.id ?? FFTT_FEDERATION_ID
  const own = phasesOfFederation(phases, seasons, federationId)
  return { options, federationId, phases: orderPhases(own), defaultPhase: defaultPhase(own) }
}
