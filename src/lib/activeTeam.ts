import type { Game, MatchDay, Phase, Team } from '../types'
import { FFTT_FEDERATION_ID, federationOfPhase } from './federations'
import { gameDate, upcomingTeamGames } from './matchdays'

/**
 * The team a member plays in now (#711): theirs in the active phase of ANY
 * federation. Asking `activePhaseOf(phases)` alone answered for the FFTT, so a
 * Landser player — AGR only — had no team, and the home showed the generic
 * view with no « Ma disponibilité ».
 *
 * A member of Kembs has one in each (#645). The home is built around one team,
 * so it opens on the one whose next match comes first; failing any, the FFTT's.
 */
export function activeTeamOf<T extends Pick<Team, 'id' | 'phaseId' | 'playerIds'>>(
  playerId: string | undefined,
  teams: readonly T[],
  phases: ReadonlyArray<Pick<Phase, 'id' | 'status' | 'federationId'>>,
  games: readonly Game[],
  matchDaysById: Map<string, MatchDay>,
  today: string,
): T | undefined {
  if (!playerId) return undefined
  const active = new Map(phases.filter((p) => p.status === 'active').map((p) => [p.id, p]))
  const mine = teams.filter((t) => active.has(t.phaseId) && t.playerIds.includes(playerId))
  if (mine.length < 2) return mine[0]
  const nextDate = (t: T): string => {
    const next = upcomingTeamGames(games.filter((g) => g.homeTeamId === t.id || g.awayTeamId === t.id), matchDaysById, today)[0]
    const md = next ? matchDaysById.get(next.matchDayId) : undefined
    return (next && md && gameDate(next, md)) || '￿'
  }
  const isFftt = (t: T) => federationOfPhase(active.get(t.phaseId)!) === FFTT_FEDERATION_ID
  return [...mine].sort((a, b) => nextDate(a).localeCompare(nextDate(b)) || Number(isFftt(b)) - Number(isFftt(a)))[0]
}
