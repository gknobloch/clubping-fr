// Shared domain logic — the mobile match screen's pager (#552). Free of any
// browser/RN/Node deps, like the rest of this folder.
import type { Game, MatchDay, Phase, Team } from '../types'
import { teamPhaseEntries } from './teamPhases'

/**
 * Which matches border the one on screen.
 *
 * Two axes, because two different questions bring somebody to a match screen,
 * and neither answers the other: a club officer walking a *journée* wants the
 * club's other fixtures of that round, a captain preparing a *team* wants that
 * team's next fixture. Offering both at once would put two meanings on one
 * gesture, so the screen the viewer came from names the axis and this module
 * only answers it.
 */
export type GameAxis = 'round' | 'team'

/**
 * One stop on the axis.
 *
 * A match screen is one *team's* view of a fixture — who is available, who is
 * picked — so a stop is the pair, never a `gameId` on its own. The same
 * fixture is two different screens to the two clubs in it, and on the round
 * axis the neighbour is literally another team.
 *
 * The two numbers are what tells one stop from another, and they are carried
 * here rather than looked up again by whoever draws the label: the round axis
 * moves between the club's teams (Équipe 1, Équipe 2…), the team axis between
 * journées (J4, J5…).
 */
export interface GameStep {
  gameId: string
  teamId: string
  /** The journée this fixture belongs to. */
  matchDayNumber: number
  /** The team's number within its club. */
  teamNumber: number
}

export interface GameNeighbours {
  axis: GameAxis
  /** 0-based position of the fixture on screen. */
  index: number
  /** How many stops the axis holds, the current one included. */
  total: number
  previous?: GameStep
  next?: GameStep
}

export interface GameNeighbourData {
  teams: Team[]
  games: Game[]
  matchDays: MatchDay[]
  phases: Phase[]
}

/**
 * The club's fixtures in one round, in team order.
 *
 * A `MatchDay` row is per *group*, so "Journée 5" is as many rows as the club
 * has poules; a team's own round is the row in its own group. Matching on the
 * number alone would reach into another phase, which numbers its journées from
 * 1 again.
 *
 * The order is the club's teams by number — the order the tablet matrix shows
 * and the order the phone's cards are built in. That list is then split for
 * display, the viewer's own match first, but that is a highlight and not a
 * second ordering.
 */
function roundSteps(team: Team, matchDay: MatchDay, data: GameNeighbourData): GameStep[] {
  const steps: GameStep[] = []
  const clubTeams = data.teams
    .filter((t) => t.clubId === team.clubId && t.phaseId === team.phaseId)
    .sort((a, b) => a.number - b.number)
  for (const t of clubTeams) {
    const dayIds = new Set(
      data.matchDays
        .filter((md) => md.groupId === t.groupId && md.number === matchDay.number)
        .map((md) => md.id),
    )
    const game = data.games.find(
      (g) => dayIds.has(g.matchDayId) && (g.homeTeamId === t.id || g.awayTeamId === t.id),
    )
    // A team sitting the round out simply has no stop — an exempt is not a
    // screen anyone can open.
    if (game) {
      steps.push({
        gameId: game.id,
        teamId: t.id,
        matchDayNumber: matchDay.number,
        teamNumber: t.number,
      })
    }
  }
  return steps
}

/**
 * This team's fixtures across its phase, by date.
 *
 * Straight from `teamPhaseEntries`, so the swipe walks exactly the list "Tous
 * les matchs de l'équipe" prints — a second derivation of the same thing would
 * let the two disagree about where the season ends.
 */
function teamSteps(team: Team, data: GameNeighbourData): GameStep[] {
  const entry = teamPhaseEntries(team, data.teams, data.phases, data.matchDays, data.games, {
    includeEmpty: true,
  }).find((e) => e.teamId === team.id)
  return (entry?.games ?? []).flatMap((g) =>
    g.matchDay
      ? [{
          gameId: g.id,
          teamId: team.id,
          matchDayNumber: g.matchDay.number,
          teamNumber: team.number,
        }]
      : [],
  )
}

/**
 * Every stop on the axis, in order.
 *
 * What a *rail* lists and what a swipe walks are the same list, so they are
 * the same derivation (#585): the tablet's «Journée X» prints these rows and
 * `gameNeighbours` picks the two either side of the one on screen. Two
 * derivations of "the club's matches this round" would eventually disagree
 * about an exempt team, and the rail and the pager would then hold different
 * calendars.
 */
export function gameAxisSteps(
  current: { gameId: string; teamId: string },
  axis: GameAxis,
  data: GameNeighbourData,
): GameStep[] {
  const team = data.teams.find((t) => t.id === current.teamId)
  const game = data.games.find((g) => g.id === current.gameId)
  if (!team || !game) return []
  const matchDay = data.matchDays.find((md) => md.id === game.matchDayId)
  if (!matchDay) return []
  return axis === 'round' ? roundSteps(team, matchDay, data) : teamSteps(team, data)
}

/**
 * The stops either side of the fixture on screen, or `null` when there is
 * nowhere to go.
 *
 * Null rather than a one-stop axis on purpose: a control that cannot move is a
 * control nobody should be shown, and saying so here keeps every caller from
 * having to decide it again.
 */
export function gameNeighbours(
  current: { gameId: string; teamId: string },
  axis: GameAxis,
  data: GameNeighbourData,
): GameNeighbours | null {
  const steps = gameAxisSteps(current, axis, data)
  const index = steps.findIndex((s) => s.gameId === current.gameId && s.teamId === current.teamId)
  if (index < 0 || steps.length < 2) return null

  return { axis, index, total: steps.length, previous: steps[index - 1], next: steps[index + 1] }
}

/**
 * The axis a match screen is on, from the `from` route param.
 *
 * One place, because two things read it and they must never disagree: the
 * screen, which decides what a swipe does, and the tab bar, which decides
 * which section stays lit underneath (#552). Anything unsaid is the team's
 * phase — the accueil's next match, Mes matchs, a push notification — which
 * is the one axis always there, and the reason the tab bar lights Équipes
 * rather than Journées for those.
 */
export function gameAxisFromParam(from: string | undefined): GameAxis {
  return from === 'round' ? 'round' : 'team'
}
