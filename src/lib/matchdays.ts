// Shared domain logic — imported by the web app (@/lib/matchdays) and the
// mobile app (@shared/lib/matchdays). Keep this module free of any
// browser/RN/Node deps.
import type { Team, Game, MatchDay, GameSelection } from '../types'

// Players already selected for another club team in the same journée (round
// number), mapped to that team's number — they can't be fielded twice the
// same match-day, so they're non-selectable for the current team.
export function playersCommittedElsewhere(
  currentTeamId: string,
  roundNumber: number,
  clubTeams: Team[],
  games: Game[],
  matchDays: MatchDay[],
  gameSelections: GameSelection[],
): Map<string, number> {
  const mdNumberById = new Map(matchDays.map((md) => [md.id, md.number]))
  const clubTeamById = new Map(clubTeams.map((t) => [t.id, t]))
  const result = new Map<string, number>()
  for (const sel of gameSelections) {
    if (sel.teamId === currentTeamId) continue
    const team = clubTeamById.get(sel.teamId)
    if (!team) continue
    const game = games.find((g) => g.id === sel.gameId)
    if (!game || mdNumberById.get(game.matchDayId) !== roundNumber) continue
    for (const pid of sel.playerIds) if (!result.has(pid)) result.set(pid, team.number)
  }
  return result
}

// Games own their date (#271); a match_day's date is derived server-side as
// the MIN of its games' dates. updateGame/addGame call the API fire-and-forget
// (no awaited response to sync from), so the optimistic client state needs
// its own mirror of that same derivation to avoid showing a stale date until
// the next full refetch.
export function deriveMatchDayDate(gamesForMatchDay: Game[], currentDate: string): string {
  const dates = gamesForMatchDay.map((g) => g.date).filter((d): d is string => !!d)
  return dates.length ? dates.sort()[0] : currentDate
}

/** A specific game's own date, falling back to its match day's (derived) date when unset. */
export const gameDate = (game: Game, matchDay: MatchDay): string => game.date ?? matchDay.date
