// FFTT games (calendar) import logic (#231), shared by the API and the web UI.
//
// Source: POST https://apiv2.fftt.com/api/graphql
//   { pools(group_id: <FFTT division id>) { edges { node { id sportMatches {...} } } } }
// Local ids line up with FFTT ids thanks to #219/#229: local division id =
// FFTT division id ("group" in their schema), local group id = FFTT pool id,
// and local team ids for imported teams = FFTT team ids (verified: dafunker
// idequipe 5834 = GraphQL /api/teams/5834).

import { ffttIdFromIri } from './ffttDivisions'

/** One side of a match as returned by the sportMatches GraphQL query. */
export interface FfttMatchOpponentNode {
  team?: {
    id: string
    name: string
    clubs?: { edges?: Array<{ node?: { id?: string; identifier?: string; name?: string } }> }
  } | null
}

/** A sportMatch node as returned by the GraphQL query. */
export interface FfttSportMatchNode {
  id: string
  roundNumber?: number | null
  date?: string | null
  homeOpponent?: FfttMatchOpponentNode | null
  awayOpponent?: FfttMatchOpponentNode | null
}

/** One side of a parsed match. */
export interface FfttMatchTeam {
  /** FFTT team id (numeric text) — equals the local team id for imported teams. */
  teamId: string
  /** Team label, e.g. "THIONVILLE TT 1". */
  teamName: string
  /** Team number parsed from the label; null when undetectable. */
  teamNumber: number | null
  /** Club affiliation number, e.g. "06570024"; empty when FFTT omits the club. */
  clubIdentifier: string
  clubName: string
}

/** A parsed, importable match. */
export interface FfttMatch {
  /** FFTT match id (numeric text), used as the local game id. */
  id: string
  /** Round number → local MatchDay.number. */
  round: number
  /** Match date as YYYY-MM-DD (FFTT dates carry no meaningful time). */
  date: string
  home: FfttMatchTeam
  away: FfttMatchTeam
}

/** "THIONVILLE TT 1" → 1, "LUNEVILLE ALTT (1)" → 1; null when no number found. */
export function teamNumberFromName(name: string): number | null {
  const m = name.match(/(\d+)\s*\)?\s*$/)
  return m ? Number(m[1]) : null
}

/**
 * Poule number from an FFTT pool name: "3" → 3, letters map alphabetically
 * ("B" → 2, as in the teams import); null when unreadable. Used to line a
 * local group up with its apiv2 pool — SPID cx_poule ids (our local group
 * ids) and apiv2 pool ids are different id spaces, so ids can't be compared.
 */
export function poolNumberFromName(name: string | null | undefined): number | null {
  const trimmed = (name ?? '').trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  if (/^[A-Za-z]$/.test(trimmed)) return trimmed.toUpperCase().charCodeAt(0) - 64
  return null
}

/** A parsed apiv2 pool: its FFTT id, poule number (from the name), and matches. */
export interface FfttPool {
  id: string
  poolNumber: number | null
  matches: FfttMatch[]
}

/**
 * The GraphQL document the browser sends to apiv2 for a division's pools and
 * their matches. Browser-side because FFTT blocks Cloudflare egress IPs
 * (see ffttClient.ts); the id is numeric-sanitized before interpolation.
 */
export function divisionPoolsQuery(divisionId: string): string {
  const safe = divisionId.replace(/\D/g, '') || '0'
  return `{ pools(group_id: ${safe}) { edges { node { id name sportMatches { edges { node { id roundNumber date ` +
    `homeOpponent { team { id name clubs { edges { node { identifier name } } } } } ` +
    `awayOpponent { team { id name clubs { edges { node { identifier name } } } } } } } } } } } }`
}

/** GraphQL response shape of divisionPoolsQuery. */
export interface FfttDivisionPoolsData {
  pools?: { edges?: Array<{ node?: { id: string; name?: string | null; sportMatches?: { edges?: Array<{ node?: FfttSportMatchNode }> } } }> }
}

/** Parse a divisionPoolsQuery response into typed pools. */
export function parseDivisionPools(data: FfttDivisionPoolsData): FfttPool[] {
  return (data.pools?.edges ?? []).flatMap((e) => e.node ? [{
    id: ffttIdFromIri(e.node.id),
    poolNumber: poolNumberFromName(e.node.name),
    matches: parseSportMatches(e.node.sportMatches?.edges),
  }] : [])
}

/**
 * Pick the pool corresponding to a local group. The group's own FFTT pool id
 * wins when it has one (#278) — that is the pool, no inference needed.
 * Otherwise membership: a pool whose matches involve one of the group's known
 * team ids (local team ids are FFTT team ids for imported teams) is the right
 * one even if numbering drifted. Failing that, poule number = group number.
 */
export function selectPoolForGroup(
  pools: FfttPool[],
  group: { number: number; teamIds: string[]; groupId?: string },
): FfttPool | null {
  if (group.groupId) {
    const byPoolId = pools.find((p) => p.id === group.groupId)
    if (byPoolId) return byPoolId
  }
  const known = new Set(group.teamIds)
  const byMembership = pools.find((p) =>
    p.matches.some((m) => known.has(m.home.teamId) || known.has(m.away.teamId)))
  if (byMembership) return byMembership
  return pools.find((p) => p.poolNumber !== null && p.poolNumber === group.number) ?? null
}

function parseOpponent(node: FfttMatchOpponentNode | null | undefined): FfttMatchTeam | null {
  const team = node?.team
  if (!team?.id || !team.name) return null
  const club = team.clubs?.edges?.[0]?.node
  return {
    teamId: ffttIdFromIri(team.id),
    teamName: team.name.trim(),
    teamNumber: teamNumberFromName(team.name),
    clubIdentifier: club?.identifier ?? '',
    clubName: club?.name ?? '',
  }
}

/**
 * Parse one sportMatch node, or null when it cannot be imported: byes/exempt
 * rounds have a missing opponent, and a match without a round or date cannot
 * be attached to a journée.
 */
export function parseSportMatch(node: FfttSportMatchNode): FfttMatch | null {
  const home = parseOpponent(node.homeOpponent)
  const away = parseOpponent(node.awayOpponent)
  if (!home || !away) return null
  if (typeof node.roundNumber !== 'number' || node.roundNumber < 1) return null
  const date = (node.date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return { id: ffttIdFromIri(node.id), round: node.roundNumber, date, home, away }
}

/** Parse a pool's sportMatches edges, dropping unusable entries, ordered by round then id. */
export function parseSportMatches(
  edges: Array<{ node?: FfttSportMatchNode }> | undefined,
): FfttMatch[] {
  const matches = (edges ?? []).flatMap((e) => {
    const m = e.node ? parseSportMatch(e.node) : null
    return m ? [m] : []
  })
  return matches.sort((a, b) => a.round - b.round || a.id.localeCompare(b.id, undefined, { numeric: true }))
}
