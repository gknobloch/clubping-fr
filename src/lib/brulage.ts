// Shared domain logic — imported by the web app (@/lib/brulage) and the mobile
// app (@shared/lib/brulage). Keep this module free of any browser/RN/Node deps.
// The type import below is type-only, so it carries no runtime dependency.
import type { Team, Game, MatchDay, GameSelection, Phase, Division, Competition } from '../types'
import { federationOfTeam } from './licences'

/**
 * What the AGR rule needs beyond one phase's teams (#651): the club's teams
 * of the other phase of the season, and how to tell a team's federation.
 * Absent, every team is ruled the FFTT's way — which is what every caller
 * did before the AGR.
 */
export interface BrulageContext {
  /** Every team the app knows — the club's are picked out by `clubId`. */
  teams: readonly Team[]
  phases: readonly Phase[]
  divisions: ReadonlyArray<Pick<Division, 'id' | 'competitionId'>>
  competitions: ReadonlyArray<Pick<Competition, 'id' | 'federationId'>>
}

export interface BrulageInfo {
  /** The highest team number the player can play for (burned into this level). null = no restriction. */
  burnedIntoTeamNumber: number | null
  /** Team ID of the burned-into team (for display). null = no restriction. */
  burnedIntoTeamId: string | null
}

/**
 * For a given player and club, compute brûlage status based on game selections
 * up to (but not including) the given match-day.
 *
 * Rule: a player can play at most 1 game in a team with a lower number (higher rank)
 * than their "level". Once they've accumulated >1 games across higher-ranked teams,
 * they're burned into the highest-numbered team they played in.
 *
 * Example: played MD1 in team 2, MD2 in team 1 → burned into team 2 (can play 1 or 2, not 3+).
 * Example: played MD1 in team 1 only → no burn (1 game ≤ threshold).
 * Example: played MD1 and MD2 in team 1 → burned into team 1 (can only play team 1).
 */
export function computeBrulage(
  playerId: string,
  clubTeams: Team[],
  matchDays: MatchDay[],
  games: Game[],
  gameSelections: GameSelection[],
  /** Compute brûlage as of this match-day (exclusive — only prior match-days count). null = consider all match-days. */
  asOfMatchDayId: string | null = null,
  ctx?: BrulageContext,
): BrulageInfo {
  if (clubTeams.length === 0) return { burnedIntoTeamNumber: null, burnedIntoTeamId: null }
  const agr = agrSeason(clubTeams, ctx)
  if (agr) {
    const t = agrTitularity(playerId, agr, matchDays, games, gameSelections, asOfMatchDayId)
    // Only a titularity the matches decided is news: the declared one is the
    // roster the club wrote itself (art. 26).
    if (t.titularNumber === null || t.titularNumber === t.declaredNumber) {
      return { burnedIntoTeamNumber: null, burnedIntoTeamId: null }
    }
    const team = clubTeams.find((x) => x.number === t.titularNumber)
    return { burnedIntoTeamNumber: t.titularNumber, burnedIntoTeamId: team?.id ?? null }
  }

  const gamesPerTeam = countGamesPerTeam(playerId, clubTeams, matchDays, games, gameSelections, asOfMatchDayId)

  // Sort club teams by number ascending
  const sorted = [...clubTeams].sort((a, b) => a.number - b.number)

  // The brûlage level is the highest team N the player can still play for.
  // For team N, the player is eligible if games in teams with number < N is ≤ 1.
  // Find the highest eligible team; if it's not the last team, the player is burned into it.
  let highestEligible: Team | null = null

  for (const team of sorted) {
    let gamesInHigherRanked = 0
    for (const t of sorted) {
      if (t.number < team.number) {
        gamesInHigherRanked += gamesPerTeam.get(t.id) ?? 0
      }
    }
    if (gamesInHigherRanked <= 1) {
      highestEligible = team
    }
  }

  // The player is burned if they've played more than 1 game total across all teams
  let totalGames = 0
  for (const count of gamesPerTeam.values()) totalGames += count
  if (totalGames > 1 && highestEligible) {
    return { burnedIntoTeamNumber: highestEligible.number, burnedIntoTeamId: highestEligible.id }
  }

  return { burnedIntoTeamNumber: null, burnedIntoTeamId: null }
}

/**
 * Check if a player is eligible to be selected for a specific team on a specific match-day.
 *
 * Rule 1 (brûlage): count all games the player has played in teams with a LOWER number
 * (higher rank) than the target team. If that count > 1, the player is not eligible.
 *
 * Rule 2 (same group): if another club team shares the target team's group and the player
 * already played in that other team, they can no longer switch between same-group teams.
 */
export function isPlayerEligibleForTeam(
  playerId: string,
  targetTeam: Team,
  clubTeams: Team[],
  matchDays: MatchDay[],
  games: Game[],
  gameSelections: GameSelection[],
  matchDayId: string,
  ctx?: BrulageContext,
): boolean {
  const agr = agrSeason(clubTeams, ctx)
  if (agr) {
    // A titulaire never plays below their team (art. 92); above it, always —
    // the fourth time only moves the titularity up (art. 29).
    const { titularNumber } = agrTitularity(playerId, agr, matchDays, games, gameSelections, matchDayId)
    return titularNumber === null || targetTeam.number <= titularNumber
  }
  const gamesPerTeam = countGamesPerTeam(playerId, clubTeams, matchDays, games, gameSelections, matchDayId)

  // Rule 1: brûlage — max 1 game in higher-ranked teams
  let gamesInHigherRankedTeams = 0
  for (const team of clubTeams) {
    if (team.number < targetTeam.number) {
      gamesInHigherRankedTeams += gamesPerTeam.get(team.id) ?? 0
    }
  }
  if (gamesInHigherRankedTeams > 1) return false

  // Rule 2: same-group — can't switch between club teams in the same group
  const sameGroupClubTeams = clubTeams.filter(
    (t) => t.groupId === targetTeam.groupId && t.id !== targetTeam.id
  )
  for (const otherTeam of sameGroupClubTeams) {
    if ((gamesPerTeam.get(otherTeam.id) ?? 0) > 0) return false
  }

  return true
}

/** Count games played per team for a player, up to (exclusive) the given match-day. */
function countGamesPerTeam(
  playerId: string,
  clubTeams: Team[],
  matchDays: MatchDay[],
  games: Game[],
  gameSelections: GameSelection[],
  asOfMatchDayId: string | null,
): Map<string, number> {
  const mdNumberById = new Map(matchDays.map((md) => [md.id, md.number]))
  let cutoffNumber = Infinity
  if (asOfMatchDayId) {
    cutoffNumber = mdNumberById.get(asOfMatchDayId) ?? Infinity
  }

  const clubTeamIds = new Set(clubTeams.map((t) => t.id))
  const gamesPerTeam = new Map<string, number>()

  for (const sel of gameSelections) {
    if (!clubTeamIds.has(sel.teamId)) continue
    if (!sel.playerIds.includes(playerId)) continue

    const game = games.find((g) => g.id === sel.gameId)
    if (!game) continue

    const mdNumber = mdNumberById.get(game.matchDayId)
    if (mdNumber === undefined || mdNumber >= cutoffNumber) continue

    gamesPerTeam.set(sel.teamId, (gamesPerTeam.get(sel.teamId) ?? 0) + 1)
  }

  return gamesPerTeam
}

// ── AGR (#651) ──────────────────────────────────────────────────────────────
//
// The AGR's rule is not the FFTT's. A player is TITULAIRE of one team, the one
// the club declares at the start of the season (art. 26 — the team's roster
// here); without a declaration, the team of their first match sheet. A
// titulaire never plays below their team (art. 92). Above it, up to three
// matches over the whole SEASON — both phases — keep the titularity; the
// fourth makes them titulaire of the lowest of the higher teams they played
// in (art. 29: titulaire in 4, twice in 1, once in 2, once in 3 → titulaire
// in 3). The count then carries on above that new team.
//
// "Higher" is the team number, as everywhere in the app: 1 above 2.

const AGR_SUPERIOR_LIMIT = 3

interface AgrSeason {
  /** The club's teams in every phase of the season, a team being its number across phases. */
  teams: Team[]
  /** Chronological rank of each phase of the season. */
  phaseRank: Map<string, number>
}

/** The season the AGR rule reads, when these teams are the AGR's; null for the FFTT. */
function agrSeason(clubTeams: Team[], ctx: BrulageContext | undefined): AgrSeason | null {
  if (!ctx || clubTeams.length === 0) return null
  if (federationOfTeam(clubTeams[0], ctx.divisions, ctx.competitions) !== 'agr') return null
  const phase = ctx.phases.find((p) => p.id === clubTeams[0].phaseId)
  if (!phase) return null
  const phaseNumber = (p: Phase) => Number(/(\d+)/.exec(p.name)?.[1] ?? 0)
  const seasonPhases = ctx.phases.filter((p) => p.seasonId === phase.seasonId).sort((a, b) => phaseNumber(a) - phaseNumber(b))
  const phaseRank = new Map(seasonPhases.map((p, i) => [p.id, i]))
  const clubId = clubTeams[0].clubId
  return { teams: ctx.teams.filter((t) => t.clubId === clubId && phaseRank.has(t.phaseId)), phaseRank }
}

export interface AgrTitularity {
  /** The team number the club declared (its roster); null when none holds the player. */
  declaredNumber: number | null
  /** The team the player is titulaire of now; null before a first match without a declaration. */
  titularNumber: number | null
  /** Matches already played above it this season — the fourth moves the titularity up. */
  superiorGames: number
  /** The team number of each of those matches. */
  superiorTeamNumbers: number[]
}

/**
 * A player's AGR titularity, from the season's line-ups before `asOfMatchDayId`
 * (exclusive; null = all of them). A team's line-up counts once picked, as
 * the FFTT rule counts it.
 */
export function agrTitularity(
  playerId: string,
  season: AgrSeason,
  matchDays: MatchDay[],
  games: Game[],
  gameSelections: GameSelection[],
  asOfMatchDayId: string | null,
): AgrTitularity {
  const teamById = new Map(season.teams.map((t) => [t.id, t]))
  const mdById = new Map(matchDays.map((md) => [md.id, md]))
  const gameById = new Map(games.map((g) => [g.id, g]))
  // A journée's place in the season: its phase, then its number.
  const keyOf = (phaseId: string, number: number) => (season.phaseRank.get(phaseId) ?? 0) * 1000 + number
  let cutoff = Infinity
  if (asOfMatchDayId) {
    const md = mdById.get(asOfMatchDayId)
    const phaseId = md ? season.teams.find((t) => t.groupId === md.groupId)?.phaseId : undefined
    if (md && phaseId) cutoff = keyOf(phaseId, md.number)
  }

  const declared = season.teams.filter((t) => t.playerIds.includes(playerId)).map((t) => t.number)
  const declaredNumber = declared.length ? Math.min(...declared) : null

  const plays: Array<{ key: number; number: number }> = []
  for (const sel of gameSelections) {
    const team = teamById.get(sel.teamId)
    if (!team || !sel.playerIds.includes(playerId)) continue
    const md = mdById.get(gameById.get(sel.gameId)?.matchDayId ?? '')
    if (!md) continue
    const key = keyOf(team.phaseId, md.number)
    if (key < cutoff) plays.push({ key, number: team.number })
  }
  plays.sort((a, b) => a.key - b.key)

  let titular = declaredNumber
  let above: number[] = []
  for (const play of plays) {
    if (titular === null) { titular = play.number; continue }
    if (play.number >= titular) continue
    above.push(play.number)
    if (above.length > AGR_SUPERIOR_LIMIT) {
      titular = Math.max(...above)
      above = above.filter((n) => n < titular!)
    }
  }
  return { declaredNumber, titularNumber: titular, superiorGames: above.length, superiorTeamNumbers: above }
}

/**
 * What fielding this player in `targetTeam` on this journée would do to their
 * titularity, when it would do something: the fourth match above their team
 * makes them titulaire of the lowest higher team they played in (art. 29).
 * null at the FFTT, or when nothing changes.
 */
export function agrPickConsequence(
  playerId: string,
  targetTeam: Team,
  clubTeams: Team[],
  matchDays: MatchDay[],
  games: Game[],
  gameSelections: GameSelection[],
  matchDayId: string,
  ctx?: BrulageContext,
): { superiorGames: number; becomesTitularOf: number | null } | null {
  const agr = agrSeason(clubTeams, ctx)
  if (!agr) return null
  const t = agrTitularity(playerId, agr, matchDays, games, gameSelections, matchDayId)
  if (t.titularNumber === null || targetTeam.number >= t.titularNumber) return null
  if (t.superiorGames < AGR_SUPERIOR_LIMIT) return { superiorGames: t.superiorGames + 1, becomesTitularOf: null }
  // The fourth: the lowest higher team among those played, this one included.
  return { superiorGames: t.superiorGames + 1, becomesTitularOf: Math.max(targetTeam.number, ...t.superiorTeamNumbers) }
}

/**
 * What a line-up picker prints beside a player fielded above their team at the
 * AGR (#683) — « 2/3 au-dessus », then, for the fourth, the team it makes them
 * titulaire of. A fact, never a refusal: the fourth is allowed, it only moves
 * the titularity. null when the pick is not above their team.
 */
export interface AgrPickNote {
  /** Short, beside the name: « 2/3 au-dessus », « Titulaire en éq. 3 ». */
  label: string
  /** The fourth: what the sheet says above the list, by name. */
  becomesTitularOf: number | null
}

export function agrPickNote(
  playerId: string,
  targetTeam: Team,
  clubTeams: Team[],
  matchDays: MatchDay[],
  games: Game[],
  gameSelections: GameSelection[],
  matchDayId: string,
  ctx?: BrulageContext,
): AgrPickNote | null {
  const c = agrPickConsequence(playerId, targetTeam, clubTeams, matchDays, games, gameSelections, matchDayId, ctx)
  if (!c) return null
  return c.becomesTitularOf !== null
    ? { label: `Titulaire en éq. ${c.becomesTitularOf}`, becomesTitularOf: c.becomesTitularOf }
    : { label: `${c.superiorGames}/${AGR_SUPERIOR_LIMIT} au-dessus`, becomesTitularOf: null }
}

/** The sentence for the players a line-up would make titulaire elsewhere, by name. */
export function agrTitularityWarning(changes: Array<{ name: string; team: number }>): string | null {
  if (changes.length === 0) return null
  const what = changes.map((c) => `${c.name} deviendra titulaire de l’équipe ${c.team}`).join(' ; ')
  return `${what} : quatrième rencontre au-dessus de son équipe cette saison (art. 29).`
}
