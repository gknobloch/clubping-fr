import { gameDate } from '@/utils/matchdays'
import { getTeamName } from '@/utils/roles'
import { todayIso } from '@/utils/weeks'
import type { PlayerHistoryEntry } from '@/components/PlayerSheet'
import type { Club, Game, GameSelection, MatchDay, Team } from '@shared/types'

// ---------------------------------------------------------------------------
// Ce qu'un licencié a joué dans la phase (#581)
//
// The list under a `PlayerSheet`: every journée of the phase this player was
// fielded in, across *all* of the club's teams and not just the one whose
// screen you are on — a player lent to the équipe 2 is exactly what somebody
// opens this sheet to find out.
//
// It was written three times before it was written once: `TeamDetail`,
// `(detail)/team/phase-games` and `(detail)/match/[id]` each carried their own
// copy, and the third had already drifted — it omits the `mdInGroup` filter
// the other two apply, so a team that changed poule mid-phase (#422) listed
// fixtures from the poule it left. #581 would have made a fourth copy, which
// is what turned this into one function.
// ---------------------------------------------------------------------------

/** «5 sept.» — the day and month, which is all the sheet's rows have room for. */
function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

export function playerPhaseHistory({
  playerId,
  clubTeamsInPhase,
  matchDays,
  games,
  gameSelections,
  teams,
  clubs,
}: {
  playerId: string
  /** The club's teams for the phase in question — the scope of the answer. */
  clubTeamsInPhase: Team[]
  matchDays: MatchDay[]
  games: Game[]
  gameSelections: GameSelection[]
  /** Every team, to name the opponent. */
  teams: Team[]
  clubs: Club[]
}): PlayerHistoryEntry[] {
  // Civil date, never `new Date().toISOString()` (#561): east of Greenwich the
  // first hours of a day read back as the day before, so a match played this
  // morning would come back not-yet-played. All three copies had it wrong.
  const today = todayIso()
  const rows: { raw: string; entry: PlayerHistoryEntry }[] = []

  for (const team of clubTeamsInPhase) {
    // The journées of this team's own poule. A team can move poule without
    // being recreated (#422), and its fixtures move with it — without this,
    // the ones it left are listed too.
    const inGroup = new Set(
      matchDays.filter((md) => md.groupId === team.groupId).map((md) => md.id),
    )
    for (const game of games) {
      if (game.homeTeamId !== team.id && game.awayTeamId !== team.id) continue
      if (!inGroup.has(game.matchDayId)) continue
      const selection = gameSelections.find(
        (s) => s.teamId === team.id && s.gameId === game.id,
      )
      if (!selection?.playerIds.includes(playerId)) continue
      const matchDay = matchDays.find((md) => md.id === game.matchDayId)
      if (!matchDay) continue

      const isHome = game.homeTeamId === team.id
      const opponent = teams.find(
        (t) => t.id === (isHome ? game.awayTeamId : game.homeTeamId),
      )
      const date = gameDate(game, matchDay)
      rows.push({
        raw: date,
        entry: {
          jNumber: matchDay.number,
          icon: isHome ? 'home' : 'paper-plane-outline',
          text: opponent ? getTeamName(opponent, clubs) : '—',
          team,
          date: shortDate(date),
          isPast: date < today,
        },
      })
    }
  }

  return rows.sort((a, b) => a.raw.localeCompare(b.raw)).map((r) => r.entry)
}
