import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { isPlayerEligibleForTeam } from '@/lib/brulage'
import { answerOverride, mayAnswerFor, mayManageTeam } from '@/lib/teamAuthority'
import type { AvailabilityStatus } from '@/types'

/**
 * Availability and line-up rules for one phase, lifted out of MatchDaysPage so
 * the desktop matrix and the mobile match detail decide permissions, eligible
 * teams and "who plays this round" the same way (#306). Two copies of
 * `setPlayerSelectedForMatchDay` would be two chances to let a player be
 * fielded twice in the same round.
 */
export function useMatchDayEditing(phaseId: string | null) {
  const { user } = useAuth()
  const {
    teams, clubs, games, matchDays, divisions, groups, players,
    gameAvailabilities, gameSelections,
    getGameSelectionPlayerIds, setGameAvailability, clearGameAvailability, setGameSelectionBatch,
  } = useAppData()

  const userClubId = user?.clubId

  const myClubTeamsInPhase = useMemo(() => {
    if (!phaseId || !userClubId) return []
    return teams
      .filter((t) => t.phaseId === phaseId && t.clubId === userClubId)
      .sort((a, b) => a.number - b.number)
  }, [teams, phaseId, userClubId])

  /** Group IDs belonging to this phase (via divisions). */
  const phaseGroupIds = useMemo(() => {
    const divIds = new Set(divisions.filter((d) => d.phaseId === phaseId).map((d) => d.id))
    return new Set(groups.filter((g) => divIds.has(g.divisionId)).map((g) => g.id))
  }, [divisions, groups, phaseId])

  /**
   * Every match-day sharing this one's number across the phase's groups — the
   * same "round" in different divisions. A player may only play in one team per
   * round, so selection has to reason over all of them at once.
   */
  const getCorrespondingMatchDayIds = (matchDayId: string): string[] => {
    const md = matchDays.find((m) => m.id === matchDayId)
    if (!md) return [matchDayId]
    return matchDays.filter((m) => m.number === md.number && phaseGroupIds.has(m.groupId)).map((m) => m.id)
  }

  const getAvailability = (gameId: string, playerId: string): AvailabilityStatus | undefined =>
    gameAvailabilities.find((x) => x.gameId === gameId && x.playerId === playerId)?.status

  /**
   * The rules themselves live in `@/lib/teamAuthority` (#569), shared with the
   * app and with the API that now refuses the write. What stays here is the
   * lookup: these screens speak in ids, the rules speak in rows.
   */
  const authority = (playerId: string, teamId: string) => {
    const team = teams.find((t) => t.id === teamId)
    const player = players.find((p) => p.id === playerId)
    return user && team && player ? { user, team, player } : null
  }

  /** Only the player themselves, their captain, or their club admin. Global admin has no edit. */
  const canEditAvailability = (playerId: string, teamId: string): boolean => {
    const ctx = authority(playerId, teamId)
    return !!ctx && mayAnswerFor(ctx.user, ctx.team, ctx.player)
  }

  /** Who is answering for someone else, so the label can say so. */
  const isOverride = (playerId: string, teamId: string): 'captain' | 'club_admin' | undefined => {
    const ctx = authority(playerId, teamId)
    return ctx ? answerOverride(ctx.user, ctx.team, ctx.player) : undefined
  }

  /** Captain (their team), club admin (their club), or a general admin. */
  const canEditGameSelection = (teamId: string): boolean => {
    const team = teams.find((t) => t.id === teamId)
    return !!user && !!team && mayManageTeam(user, team)
  }

  const getSelectedTeamForGame = (gameId: string, playerId: string): string | null => {
    const game = games.find((g) => g.id === gameId)
    if (!game) return null
    if (getGameSelectionPlayerIds(gameId, game.homeTeamId).includes(playerId)) return game.homeTeamId
    if (getGameSelectionPlayerIds(gameId, game.awayTeamId).includes(playerId)) return game.awayTeamId
    return null
  }

  /** Which team this player is selected for on this round, across all groups. */
  const getSelectedTeamForMatchDay = (matchDayId: string, playerId: string): string | null => {
    for (const mdId of getCorrespondingMatchDayIds(matchDayId)) {
      for (const g of games.filter((x) => x.matchDayId === mdId)) {
        const t = getSelectedTeamForGame(g.id, playerId)
        if (t) return t
      }
    }
    return null
  }

  /**
   * Set which team this player plays for on this round. One team per round, so
   * every game across the corresponding match-days is rewritten in one batch.
   */
  const setPlayerSelectedForMatchDay = (matchDayId: string, playerId: string, teamId: string | null) => {
    const correspondingIds = getCorrespondingMatchDayIds(matchDayId)
    const allDayGames = games.filter((g) => correspondingIds.includes(g.matchDayId))
    // Only the club's own line-ups are rewritten (#569). This used to send
    // both sides of every fixture in the round: the opponent's row went out
    // unchanged, a no-op that nonetheless wrote on another club's line-up —
    // and the API now refuses it, which would have taken the whole batch with
    // it. A player can only be picked for their own club's teams anyway.
    const mine = new Set(myClubTeamsInPhase.map((t) => t.id))
    const updates: Array<{ gameId: string; teamId: string; playerIds: string[] }> = []
    for (const game of allDayGames) {
      for (const side of [game.homeTeamId, game.awayTeamId]) {
        if (!mine.has(side)) continue
        const ids = getGameSelectionPlayerIds(game.id, side).filter((id) => id !== playerId)
        if (teamId === side) ids.push(playerId)
        updates.push({ gameId: game.id, teamId: side, playerIds: ids })
      }
    }
    if (updates.length > 0) setGameSelectionBatch(updates)
  }

  /**
   * Team options for the line-up picker: the player's own team first, then the
   * empty option, then the other club teams — minus any they're not eligible
   * for (brûlage) or that have no game this round.
   */
  const orderedTeamOptionIds = (
    playerTeamId: string | null,
    playerId?: string,
    matchDayId?: string
  ): (string | null)[] => {
    let all = myClubTeamsInPhase.map((t) => t.id)
    if (matchDayId) {
      const correspondingMdIds = getCorrespondingMatchDayIds(matchDayId)
      const roundGames = games.filter((g) => correspondingMdIds.includes(g.matchDayId))
      const teamsWithGame = new Set(roundGames.flatMap((g) => [g.homeTeamId, g.awayTeamId]))
      all = all.filter((tid) => teamsWithGame.has(tid))
    }
    if (playerId && matchDayId) {
      all = all.filter((tid) => {
        const t = teams.find((x) => x.id === tid)
        return t
          ? isPlayerEligibleForTeam(playerId, t, myClubTeamsInPhase, matchDays, games, gameSelections, matchDayId)
          : false
      })
    }
    if (playerTeamId && all.includes(playerTeamId)) {
      return [playerTeamId, null, ...all.filter((id) => id !== playerTeamId)]
    }
    return [null, ...all]
  }

  /**
   * Brûlage check for one player against one team this round — the same rule
   * `orderedTeamOptionIds` filters on, exposed on its own so the renfort picker
   * can show who is ineligible rather than silently omitting them (#380).
   */
  const isEligibleForTeam = (playerId: string, teamId: string, matchDayId: string) => {
    const t = teams.find((x) => x.id === teamId)
    return t
      ? isPlayerEligibleForTeam(playerId, t, myClubTeamsInPhase, matchDays, games, gameSelections, matchDayId)
      : false
  }

  const getTeamSelectLabel = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId)
    return team ? `Éq. ${team.number}` : teamId
  }

  const getTeamColor = (teamId: string): string | undefined =>
    teams.find((t) => t.id === teamId)?.color

  const getTeamLabel = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return teamId
    return `${clubs.find((c) => c.id === team.clubId)?.displayName ?? team.clubId} ${team.number}`
  }

  return {
    myClubTeamsInPhase,
    getCorrespondingMatchDayIds,
    getAvailability,
    canEditAvailability,
    isOverride,
    canEditGameSelection,
    getSelectedTeamForMatchDay,
    setPlayerSelectedForMatchDay,
    orderedTeamOptionIds,
    isEligibleForTeam,
    getTeamSelectLabel,
    getTeamColor,
    getTeamLabel,
    setGameAvailability,
    clearGameAvailability,
  }
}
