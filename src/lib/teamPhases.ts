import type { Game, MatchDay, Phase, Team } from '../types'
import { gameDate } from './matchdays'

export type GameWithMatchDay = Game & { matchDay?: MatchDay }

export type TeamPhaseEntry = {
  /** The team record for this phase (same clubId + number, different phaseId). */
  teamId: string
  phaseId: string
  /** e.g. "Saison 2025/2026 Phase 2". */
  label: string
  isActive: boolean
  /** Games for this phase's team, sorted by match-day date ascending. */
  games: GameWithMatchDay[]
}

type TeamPhaseEntriesOptions = {
  /** Include phases whose schedule has not been published yet. */
  includeEmpty?: boolean
}

// A logical team (a club's "Équipe N") spans several phases as distinct team
// records. This collapses them back into one chronological list of phases the
// team has actually played in — shared by the team detail screen (links) and
// the team-games screen (phase switcher) so they stay in sync.
export function teamPhaseEntries(
  team: Pick<Team, 'clubId' | 'number'>,
  teams: Team[],
  phases: Phase[],
  matchDays: MatchDay[],
  games: Game[],
  { includeEmpty = false }: TeamPhaseEntriesOptions = {},
): TeamPhaseEntry[] {
  return teams
    .filter((t) => t.clubId === team.clubId && t.number === team.number)
    .map((t) => {
      const ph = phases.find((p) => p.id === t.phaseId)
      const mdInGroup = new Set(
        matchDays.filter((md) => md.groupId === t.groupId).map((md) => md.id),
      )
      const phaseGames: GameWithMatchDay[] = games
        .filter(
          (g) =>
            (g.homeTeamId === t.id || g.awayTeamId === t.id) && mdInGroup.has(g.matchDayId),
        )
        .map((g) => ({ ...g, matchDay: matchDays.find((md) => md.id === g.matchDayId) }))
        .sort((a, b) =>
          (a.matchDay ? gameDate(a, a.matchDay) : '').localeCompare(b.matchDay ? gameDate(b, b.matchDay) : ''))
      return {
        teamId: t.id,
        phaseId: t.phaseId,
        label: ph ? `Saison ${ph.displayName}` : 'Matchs',
        isActive: ph?.status === 'active',
        games: phaseGames,
      }
    })
    .filter((e) => includeEmpty || e.games.length > 0)
    // Active phase first, then most-recent label first (lexicographic desc
    // works for "Saison 2025/2026 …").
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return b.label.localeCompare(a.label)
    })
}
