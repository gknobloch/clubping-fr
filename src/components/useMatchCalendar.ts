import { useAppData } from '@/contexts/DataContext'
import { buildMatchEvent } from '@/lib/calendar'
import { icsFileName, toIcs } from '@/lib/ics'
import { downloadIcs } from '@/lib/icsDownload'
import { gameDate, gameSchedule, isSlotConfirmed } from '@/lib/matchdays'
import { getTeamName } from '@/lib/teamName'
import { getVenue, getVenueAddress } from '@/lib/venue'
import type { Game, MatchDay, Team } from '@/types'

/**
 * "Add to my calendar" for one fixture (#426) — the web's counterpart to the
 * mobile app's native event screen (#416). A row of the « Partager » menu
 * since #747, where the icon that sat beside the date went.
 *
 * A downloaded .ics rather than a link to one provider's web calendar: the
 * player keeps whichever agenda they already use, and the file is the only
 * form Apple Calendar, Outlook and Google Agenda all accept.
 *
 * The event itself is built by the shared `buildMatchEvent`, so a match says
 * the same thing in both apps — including the all-day fallback when the slot
 * has no confirmed time.
 *
 * `confirmed` is false while the date is the FFTT's guess (#429): the screens
 * that print it mark it, and an agenda is no place for a guess. One rule, so
 * every screen offering it agrees.
 */
export function useMatchCalendar(
  game: Game,
  matchDay: MatchDay,
  /** The team whose side of the fixture this is — it names the event's matchup. */
  team: Team,
): { confirmed: boolean; add: () => void } {
  const { teams, clubs, divisions } = useAppData()

  const isHome = game.homeTeamId === team.id
  const homeTeam = teams.find((t) => t.id === game.homeTeamId)
  const opponent = teams.find((t) => t.id === (isHome ? game.awayTeamId : game.homeTeamId))
  const opponentName = opponent ? getTeamName(opponent, clubs) : '?'
  const division = divisions.find((d) => d.id === team.divisionId)
  const confirmed = isSlotConfirmed(game, matchDay, homeTeam)

  function add() {
    const teamName = getTeamName(team, clubs)
    const event = buildMatchEvent({
      date: gameDate(game, matchDay),
      // The receiving club's time (#287), and none at all when its playing day
      // is unknown — the event is then all-day rather than at an invented hour.
      time: gameSchedule(game, matchDay, homeTeam).time,
      matchup: isHome ? `${teamName} – ${opponentName}` : `${opponentName} – ${teamName}`,
      matchDayNumber: matchDay.number,
      divisionLabel: division?.displayName,
      playersPerGame: division?.playersPerGame ?? 4,
      address: getVenueAddress(homeTeam, clubs),
      venueLabel: getVenue(homeTeam, clubs),
    })

    // Keyed to the game, not to the download: a club that moves the match and a
    // player who adds it again get one updated event, not two.
    downloadIcs(
      icsFileName(matchDay.number, opponentName),
      toIcs(event, `${game.id}@clubping.fr`),
    )
  }

  return { confirmed, add }
}
