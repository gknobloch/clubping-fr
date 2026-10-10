// Federations, and which one a club, a competition or a division belongs to (#643).
//
// Shared domain logic — imported by the web app (@/lib/federations), the mobile
// app (@shared/lib/federations) and the API. Keep this module free of any
// browser/RN/Node deps.
//
// Federation → competition → division → poule. A competition names its
// federation; a division reaches it through its competition, and a division
// belonging to none is the FFTT's — which is what every such division has
// always been. A club is in the FFTT when it carries an FFTT number
// (`Club.affiliationNumber`), and in any other federation when it carries an
// affiliation to it (`Club.affiliations`): see migration 0061 for why the two
// are stored apart, and `clubAffiliations` for the one place they meet.
import type { Club, ClubAffiliation, Competition, Division, Federation, Phase, Season } from '../types'
import { clubIdFromAffiliation } from './entityIds'

export const FFTT_FEDERATION_ID = 'fftt'
export const AGR_FEDERATION_ID = 'agr'

/** The federation that runs a competition; the FFTT for none, or for one predating #643. */
export function federationOfCompetition(competition: Pick<Competition, 'federationId'> | undefined): string {
  return competition?.federationId ?? FFTT_FEDERATION_ID
}

/** The federation a division plays in, through its competition. */
export function federationOfDivision(
  division: Pick<Division, 'competitionId'>,
  competitions: ReadonlyArray<Pick<Competition, 'id' | 'federationId'>>,
): string {
  const competition = division.competitionId
    ? competitions.find((c) => c.id === division.competitionId)
    : undefined
  return federationOfCompetition(competition)
}

/** The federation whose calendar a season is (#645); the FFTT for one predating it. */
export function federationOfSeason(season: Pick<Season, 'federationId'> | undefined): string {
  return season?.federationId ?? FFTT_FEDERATION_ID
}

/** The federation a phase belongs to, through its season — the FFTT when the season is unknown. */
export function federationOfPhase(
  phase: Pick<Phase, 'seasonId'>,
  seasons: ReadonlyArray<Pick<Season, 'id' | 'federationId'>>,
): string {
  return federationOfSeason(seasons.find((s) => s.id === phase.seasonId))
}

/** One federation's phases: what a phase switcher pages through once the federation is chosen. */
export function phasesOfFederation<P extends Pick<Phase, 'seasonId'>>(
  phases: ReadonlyArray<P>,
  seasons: ReadonlyArray<Pick<Season, 'id' | 'federationId'>>,
  federationId: string,
): P[] {
  return phases.filter((p) => federationOfPhase(p, seasons) === federationId)
}

/**
 * The active phase of one federation — the FFTT's unless said otherwise.
 * Since #645 each federation has its own, and `phases.find(active)` would
 * answer with whichever came first.
 */
export function activePhaseOf<P extends Pick<Phase, 'seasonId' | 'status'>>(
  phases: ReadonlyArray<P>,
  seasons: ReadonlyArray<Pick<Season, 'id' | 'federationId'>>,
  federationId: string = FFTT_FEDERATION_ID,
): P | undefined {
  return phases.find((p) => p.status === 'active' && federationOfPhase(p, seasons) === federationId)
}

/**
 * The divisions played in one federation — what a division picker offers once
 * the federation is chosen. A picker listing every federation's divisions at
 * once mixes "GE 3" with "Promotion Honneur", and offers a club a division of
 * a federation it does not belong to (#660).
 */
export function divisionsOfFederation<D extends Pick<Division, 'competitionId'>>(
  divisions: ReadonlyArray<D>,
  competitions: ReadonlyArray<Pick<Competition, 'id' | 'federationId'>>,
  federationId: string,
): D[] {
  return divisions.filter((d) => federationOfDivision(d, competitions) === federationId)
}

/**
 * Every federation a club is affiliated to, the FFTT first.
 *
 * The FFTT entry is derived from `affiliationNumber` and carries no `name`:
 * the club's FFTT name is its display name, kept in step by the imports.
 */
export function clubAffiliations(club: Pick<Club, 'affiliationNumber' | 'affiliations'>): ClubAffiliation[] {
  const fftt = club.affiliationNumber?.trim()
    ? [{ federationId: FFTT_FEDERATION_ID, affiliationNumber: club.affiliationNumber.trim() }]
    : []
  const others = (club.affiliations ?? []).filter((a) => a.federationId !== FFTT_FEDERATION_ID)
  return [...fftt, ...others]
}

/** The ids of every federation a club belongs to, the FFTT first. */
export function clubFederationIds(club: Pick<Club, 'affiliationNumber' | 'affiliations'>): string[] {
  return clubAffiliations(club).map((a) => a.federationId)
}

/** Whether a club belongs to a federation. */
export function clubIsIn(club: Pick<Club, 'affiliationNumber' | 'affiliations'>, federationId: string): boolean {
  return clubAffiliations(club).some((a) => a.federationId === federationId)
}

/**
 * The federations a screen offers when a club is in view: the club's own, the
 * FFTT first — a Landser admin never picks the FFTT, a Kembs admin picks one
 * of two (#660). Every federation when no club narrows it, which is a general
 * admin's view, and also for a club carrying no number at all: offering
 * nothing would leave such a club unable to add anything.
 */
export function federationChoices<F extends Pick<Federation, 'id'>>(
  federations: ReadonlyArray<F>,
  club?: Pick<Club, 'affiliationNumber' | 'affiliations'>,
): F[] {
  const own = club ? clubFederationIds(club) : []
  if (own.length === 0) return [...federations]
  return own.flatMap((id) => federations.filter((f) => f.id === id))
}

/**
 * The club's name in a federation's documents — its own name where that
 * federation does not print another.
 */
export function clubNameIn(
  club: Pick<Club, 'displayName' | 'affiliationNumber' | 'affiliations'>,
  federationId: string,
): string {
  const affiliation = clubAffiliations(club).find((a) => a.federationId === federationId)
  return affiliation?.name?.trim() || club.displayName
}

/**
 * The id a new club takes from its affiliation number, in the same id space the
 * imports use: `club-fftt-06680011` for the FFTT (#275), `club-agr-680036` for
 * a club outside it. Null when the number is not one — the caller generates an
 * id instead, as it always has.
 */
export function clubIdForAffiliation(federationId: string, affiliationNumber: string | undefined): string | null {
  if (federationId === FFTT_FEDERATION_ID) return clubIdFromAffiliation(affiliationNumber)
  const n = (affiliationNumber ?? '').trim()
  return /^[a-z]+$/.test(federationId) && /^\d+$/.test(n) ? `club-${federationId}-${n}` : null
}

/**
 * The line a club's identity card prints under its name: "N° 06680011" for a
 * club of the FFTT alone — what it has always printed — and every federation
 * named once there is more than one, or one that is not the FFTT
 * ("FFTT n° 06680140 · AGR n° 680021"). Empty when the club has no number.
 */
export function affiliationsLine(
  club: Pick<Club, 'affiliationNumber' | 'affiliations'>,
  shortNameOf: (federationId: string) => string,
): string {
  const all = clubAffiliations(club).filter((a) => a.affiliationNumber.trim())
  if (all.length === 1 && all[0].federationId === FFTT_FEDERATION_ID) return `N° ${all[0].affiliationNumber}`
  return all.map((a) => `${shortNameOf(a.federationId)} n° ${a.affiliationNumber}`).join(' · ')
}

/**
 * A federation as a picker offers it: "FFTT — Fédération française de tennis
 * de table", but "AGR Tennis de table — Section du Haut-Rhin" — the short
 * name is not repeated when the full one already starts with it.
 */
export function federationOptionLabel(federation: Pick<Federation, 'shortName' | 'displayName'>): string {
  return federation.displayName.startsWith(federation.shortName)
    ? federation.displayName
    : `${federation.shortName} — ${federation.displayName}`
}
