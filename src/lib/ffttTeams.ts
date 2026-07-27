// FFTT club-teams import logic (#229, reworked in #231 follow-up), shared by
// the API and the web UI.
//
// Source: POST https://apiv2.fftt.com/api/graphql
//   { poolOpponents(opponent_team_clubs_identifier: "<affiliation>",
//                   pool_group_tour_division_contest_season_current: true) ... }
// One node per engaged team of the club for the current season, carrying the
// team (FFTT id + name), its apiv2 pool (id + poule number) and its division
// (id, name, phase). The original dafunker source was dropped: FFTT blocks
// Cloudflare egress IPs, so the browser fetches apiv2 directly (CORS *) and
// hands the parsed payload to our API.

import { divisionDisplayName, ffttIdFromIri } from './ffttDivisions'
import { teamNumberFromName } from './ffttGames'

/** A poolOpponents node as returned by the GraphQL query. */
export interface FfttPoolOpponentNode {
  opponent?: {
    team?: { id: string; name: string } | null
  } | null
  pool?: {
    id: string
    name?: string | null
    group?: {
      tour?: {
        division?: {
          id: string
          identifier?: string | null
          name?: string | null
          phase?: { id: string } | null
          parent?: { id: string } | null
        } | null
      } | null
    } | null
  } | null
}

/** A parsed, importable club team engagement. */
export interface FfttClubTeam {
  /** FFTT team id (numeric text) — becomes the local team id on import. */
  id: string
  /** Team number within the club ("RIXHEIM PPA (5)" → 5). */
  number: number
  /** FFTT phase id (1..3); null when the division carries no phase. */
  phase: number | null
  /** FFTT division id = local division id (#219). */
  divisionId: string
  /** Division display name, phase marker stripped (#275): "GE 2 Phase 1" → "GE 2". */
  divisionName: string
  /** FFTT division identifier, e.g. "GE2P1"; '' when the payload omits it. */
  divisionIdentifier: string
  /** FFTT id of the division's parent (#236); null when it has none. */
  divisionParentId: string | null
  /** apiv2 pool id — becomes the local group id (the id space the games import queries). */
  poolId: string
  /** Poule number (pool name "9" → 9); null when unreadable. */
  poolNumber: number | null
  /** Original team label, for display. */
  label: string
}

/** "3" → 3 (pool names are the poule number); null when unreadable. */
function poolNumber(name: string | null | undefined): number | null {
  const trimmed = (name ?? '').trim()
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null
}

/**
 * Parse one poolOpponents node, or null when it lacks the team, pool or
 * division (an engagement without those cannot be imported), or a readable
 * team number.
 */
export function parsePoolOpponent(node: FfttPoolOpponentNode): FfttClubTeam | null {
  const team = node.opponent?.team
  const pool = node.pool
  const division = pool?.group?.tour?.division
  if (!team?.id || !team.name || !pool?.id || !division?.id) return null
  const number = teamNumberFromName(team.name)
  if (number === null) return null
  const phase = division.phase ? Number(ffttIdFromIri(division.phase.id)) : NaN
  return {
    id: ffttIdFromIri(team.id),
    number,
    phase: Number.isInteger(phase) && phase >= 1 ? phase : null,
    divisionId: ffttIdFromIri(division.id),
    divisionName:
      divisionDisplayName((division.name ?? '').trim()) || `Division ${ffttIdFromIri(division.id)}`,
    divisionIdentifier: (division.identifier ?? '').trim(),
    divisionParentId: division.parent ? ffttIdFromIri(division.parent.id) : null,
    poolId: ffttIdFromIri(pool.id),
    poolNumber: poolNumber(pool.name),
    label: team.name.trim(),
  }
}

/** Parse a poolOpponents response, dropping unusable nodes, ordered by team number. */
export function parsePoolOpponents(
  edges: Array<{ node?: FfttPoolOpponentNode }> | undefined,
): FfttClubTeam[] {
  const teams = (edges ?? []).flatMap((e) => {
    const t = e.node ? parsePoolOpponent(e.node) : null
    return t ? [t] : []
  })
  return teams.sort((a, b) => (a.phase ?? 9) - (b.phase ?? 9) || a.number - b.number)
}

/** The GraphQL document the browser sends to apiv2 for a club's engagements. */
export function poolOpponentsQuery(affiliation: string): string {
  const safe = affiliation.replace(/[^0-9A-Za-z]/g, '')
  return `{ poolOpponents(opponent_team_clubs_identifier: "${safe}", pool_group_tour_division_contest_season_current: true, first: 60) ` +
    `{ edges { node { opponent { team { id name } } ` +
    `pool { id name group { tour { division { id identifier name phase { id } parent { id } } } } } } } } }`
}
