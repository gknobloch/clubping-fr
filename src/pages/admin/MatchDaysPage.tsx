import { useState, useMemo, useCallback, Fragment, useRef, useEffect } from 'react'
import type { MatchDay, AvailabilityStatus, Player } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { importableGroupIds as importableGroupIdsFor } from '@/lib/importScope'
import { useAppData } from '@/contexts/DataContext'
import { computeBrulage, isPlayerEligibleForTeam } from '@/lib/brulage'
import {
  gameDate,
  gameSchedule,
  getPhaseMatchDays,
  activeMatchDayNumber,
  formatMatchDayRange,
} from '@/lib/matchdays'
import { MatchDayCards, type MatchDayCardEntry } from '@/components/MatchDayCards'
import { sortByName } from '@/lib/sortByName'
import { PageHeader } from '@/components/PageHeader'
import { ImportGamesModal } from '@/components/ImportGamesModal'
import { ModalShell } from '@/components/ModalShell'
import { ImportIcon } from '@/components/icons'
import {
  AVAILABILITY_COLORS,
  AVAILABILITY_LABELS,
  AvailabilitySelect,
  ReadOnlyCompo,
  TeamSelect,
} from '@/components/availabilityControls'

/** Number of match-day columns visible at once before pagination kicks in. */
const VISIBLE_MATCH_DAY_COUNT = 3

/** Get Monday 00:00 local time of the week containing the given date. */
function getWeekMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=Sun, 1=Mon, ...
  const diff = (day + 6) % 7 // days since Monday
  d.setDate(d.getDate() - diff)
  return d
}

/**
 * Compute the smart default offset so columns show [previous, current, next].
 * "Current" = the match day whose date falls in the current Mon-Sun week.
 */
function computeSmartOffset(sortedMatchDays: { date: string }[]): number {
  if (sortedMatchDays.length === 0) return 0
  const today = new Date()
  const thisMonday = getWeekMonday(today)

  // Find the index of the match day in the current week
  let currentIdx = -1
  for (let i = 0; i < sortedMatchDays.length; i++) {
    const mdDate = new Date(sortedMatchDays[i].date + 'T00:00:00')
    const mdMonday = getWeekMonday(mdDate)
    if (mdMonday.getTime() === thisMonday.getTime()) {
      currentIdx = i
      break
    }
  }

  if (currentIdx === -1) {
    // No match day this week — find the next upcoming one
    const todayTime = today.getTime()
    const nextIdx = sortedMatchDays.findIndex(
      (md) => new Date(md.date + 'T00:00:00').getTime() >= todayTime
    )
    if (nextIdx === -1) {
      // All in the past: show last 3
      return Math.max(0, sortedMatchDays.length - VISIBLE_MATCH_DAY_COUNT)
    }
    // Show previous + next upcoming
    currentIdx = nextIdx
  }

  // Position so current is the middle column: offset = currentIdx - 1
  const offset = Math.max(0, currentIdx - 1)
  const maxOffset = Math.max(0, sortedMatchDays.length - VISIBLE_MATCH_DAY_COUNT)
  return Math.min(offset, maxOffset)
}

/** A match day is "past" if the current week is strictly after its week. */
function isMatchDayDatePast(dateStr: string): boolean {
  const mdDate = new Date(dateStr + 'T00:00:00')
  const mdMonday = getWeekMonday(mdDate)
  const thisMonday = getWeekMonday(new Date())
  return thisMonday.getTime() > mdMonday.getTime()
}

/** Fixed column widths so team tables and Other players table stay aligned. */
const TABLE_COL_WIDTHS = {
  joueur: 180,
  dispo: 64,
  joues: 64,
  brulage: 80,
  matchDayDispo: 96,
  matchDayCompo: 96,
} as const

function MatchDayColgroup({ matchDayCount }: { matchDayCount: number }) {
  return (
    <colgroup>
      <col style={{ width: TABLE_COL_WIDTHS.joueur }} />
      <col style={{ width: TABLE_COL_WIDTHS.dispo }} />
      <col style={{ width: TABLE_COL_WIDTHS.joues }} />
      <col style={{ width: TABLE_COL_WIDTHS.brulage }} />
      {Array.from({ length: matchDayCount * 2 }, (_, i) => (
        <col
          key={i}
          style={{
            width: i % 2 === 0 ? TABLE_COL_WIDTHS.matchDayDispo : TABLE_COL_WIDTHS.matchDayCompo,
          }}
        />
      ))}
    </colgroup>
  )
}

export function MatchDaysPage() {
  const { user } = useAuth()
  const {
    phases,
    divisions,
    groups,
    matchDays,
    games,
    teams,
    clubs,
    players,
    gameAvailabilities,
    gameSelections,
    setGameAvailability,
    clearGameAvailability,
    getGameSelectionPlayerIds,
    setGameSelectionBatch,
    addMatchDay,
    updateMatchDay,
    addGame,
    updateGame,
  } = useAppData()
  const hasClubScope = (user?.role === 'club_admin' || user?.role === 'player') && !!user?.clubId
  const scopedClub = hasClubScope ? clubs.find((c) => c.id === user?.clubId) : undefined
  const isAdmin = user?.role === 'general_admin' || user?.role === 'club_admin'
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>(
    () => phases.find((p) => p.status === 'active')?.id ?? phases[0]?.id ?? ''
  )
  const [importGamesOpen, setImportGamesOpen] = useState(false)

  /** Groups of the selected phase that contain at least one team — the FFTT
   *  calendar import scope for this page (#231). */
  const importScopeClubId = hasClubScope ? user?.clubId : undefined
  const importableGroupIds = useMemo(
    () => importableGroupIdsFor({
      phaseId: selectedPhaseId, divisions, groups, teams, clubId: importScopeClubId,
    }),
    [divisions, groups, teams, selectedPhaseId, importScopeClubId],
  )

  /** All teams of the user's club in the selected phase (one block per team; each team has its own group's match-days). */
  const userClubId = user?.clubId

  const myClubTeamsInPhase = useMemo(() => {
    if (!selectedPhaseId || !userClubId) return []
    return teams
      .filter((t) => t.phaseId === selectedPhaseId && t.clubId === userClubId)
      .sort((a, b) => {
        const clubA = clubs.find((c) => c.id === a.clubId)?.displayName ?? a.clubId
        const clubB = clubs.find((c) => c.id === b.clubId)?.displayName ?? b.clubId
        const nameA = `${clubA} ${a.number}`
        const nameB = `${clubB} ${b.number}`
        return nameA.localeCompare(nameB)
      })
  }, [teams, clubs, selectedPhaseId, userClubId])

  /** Match-days for a given team (its group). */
  const getMatchDaysForTeam = useCallback(
    (teamId: string) => {
      const team = teams.find((t) => t.id === teamId)
      if (!team) return []
      return matchDays
        .filter((m) => m.groupId === team.groupId)
        .sort((a, b) => a.number - b.number)
    },
    [teams, matchDays],
  )

  /** For "Other players" we use the first team's group match-days. */
  const otherGroupMatchDays = useMemo(() => {
    const first = myClubTeamsInPhase[0]
    if (!first) return []
    return getMatchDaysForTeam(first.id)
  }, [myClubTeamsInPhase, getMatchDaysForTeam])

  /** Club players (active) not in any of the phase's team rosters; for "Other players" section. */
  const otherPlayers = useMemo(() => {
    if (!userClubId) return []
    const inRoster = new Set(myClubTeamsInPhase.flatMap((t) => t.playerIds ?? []))
    return sortByName(
      players.filter(
        (p) =>
          p.clubId === userClubId &&
          p.status === 'active' &&
          !inRoster.has(p.id),
      ),
    )
  }, [players, userClubId, myClubTeamsInPhase])

  const [editingMatchDay, setEditingMatchDay] = useState<MatchDay | null>(null)
  const [creatingMatchDay, setCreatingMatchDay] = useState(false)
  const [matchDayForm, setMatchDayForm] = useState({ groupId: '', number: 1, date: '' })

  /** Opened by clicking a match-day header (J1, J2, …): edit or create game for that team + match-day. */
  const [gameEditModal, setGameEditModal] = useState<{ teamId: string; matchDayId: string } | null>(null)
  const [gameEditForm, setGameEditForm] = useState({
    date: '',
    time: '',
    isHome: true,
    opponentTeamId: '',
  })
  /** Sliding window: which match-days are visible per team (index into that team's group match-days). */
  const [matchDayOffsetByTeamId, setMatchDayOffsetByTeamId] = useState<Record<string, number>>({})
  const [otherMatchDayOffset, setOtherMatchDayOffset] = useState(0)

  /** Global match-day offset applied to all teams at once. */
  const [globalMatchDayOffset, setGlobalMatchDayOffset] = useState(0)
  const globalMaxMatchDays = useMemo(
    () =>
      Math.max(0, ...myClubTeamsInPhase.map((t) => getMatchDaysForTeam(t.id).length)),
    [myClubTeamsInPhase, getMatchDaysForTeam]
  )
  const globalMaxOffset = Math.max(0, globalMaxMatchDays - VISIBLE_MATCH_DAY_COUNT)

  const setGlobalOffset = (newOffset: number) => {
    const clamped = Math.max(0, Math.min(globalMaxOffset, newOffset))
    setGlobalMatchDayOffset(clamped)
    const byTeam: Record<string, number> = {}
    for (const t of myClubTeamsInPhase) {
      const teamMax = Math.max(0, getMatchDaysForTeam(t.id).length - VISIBLE_MATCH_DAY_COUNT)
      byTeam[t.id] = Math.min(clamped, teamMax)
    }
    setMatchDayOffsetByTeamId(byTeam)
    const otherMax = Math.max(0, otherGroupMatchDays.length - VISIBLE_MATCH_DAY_COUNT)
    setOtherMatchDayOffset(Math.min(clamped, otherMax))
  }

  /** Whether a match day is in a past week (read-only). */
  const isMatchDayPast = (matchDayId: string): boolean => {
    const md = matchDays.find((m) => m.id === matchDayId)
    return md ? isMatchDayDatePast(md.date) : false
  }

  // Auto-position to smart offset on phase change
  const autoPositionedPhaseRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedPhaseId || myClubTeamsInPhase.length === 0) return
    if (autoPositionedPhaseRef.current === selectedPhaseId) return
    autoPositionedPhaseRef.current = selectedPhaseId
    // Use the first team's match days as reference
    const refMatchDays = getMatchDaysForTeam(myClubTeamsInPhase[0].id)
    const smartOffset = computeSmartOffset(refMatchDays)
    setGlobalOffset(smartOffset)
  }, [selectedPhaseId, myClubTeamsInPhase.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const getTeamLabel = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return teamId
    const club = clubs.find((c) => c.id === team.clubId)
    return `${club?.displayName ?? team.clubId} ${team.number}`
  }

  const getTeamSelectLabel = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return teamId
    return `Éq. ${team.number}`
  }

  const getTeamColor = (teamId: string): string | undefined =>
    teams.find((t) => t.id === teamId)?.color

  /** Team options for selection: player's team first (if any), then empty, then all other club teams.
   *  Filters out teams the player is not eligible for (brûlage) on the given match-day. */
  const orderedTeamOptionIds = (playerTeamId: string | null, playerId?: string, matchDayId?: string): (string | null)[] => {
    let all = myClubTeamsInPhase.map((t) => t.id)
    if (matchDayId) {
      // Only include teams that actually have a game on this round
      const correspondingMdIds = getCorrespondingMatchDayIds(matchDayId)
      const roundGames = games.filter((g) => correspondingMdIds.includes(g.matchDayId))
      const teamsWithGame = new Set(roundGames.flatMap((g) => [g.homeTeamId, g.awayTeamId]))
      all = all.filter((tid) => teamsWithGame.has(tid))
    }
    if (playerId && matchDayId) {
      all = all.filter((tid) => {
        const t = teams.find((x) => x.id === tid)
        return t ? isPlayerEligibleForTeam(playerId, t, myClubTeamsInPhase, matchDays, games, gameSelections, matchDayId) : false
      })
    }
    if (playerTeamId && all.includes(playerTeamId)) {
      const rest = all.filter((id) => id !== playerTeamId)
      return [playerTeamId, null, ...rest]
    }
    return [null, ...all]
  }

  const getGroupLabel = (groupId: string) => {
    const g = groups.find((x) => x.id === groupId)
    if (!g) return groupId
    const div = divisions.find((d) => d.id === g.divisionId)
    return div ? `${div.displayName} – Groupe ${g.number}` : `Groupe ${g.number}`
  }

  const getAvailability = (gameId: string, playerId: string): AvailabilityStatus | undefined => {
    const a = gameAvailabilities.find((x) => x.gameId === gameId && x.playerId === playerId)
    return a?.status
  }

  /** Only player (self), captain (their team), or club_admin (their club). Global admin has no edit. */
  const canEditAvailability = (playerId: string, teamId: string): boolean => {
    if (!user) return false
    const team = teams.find((t) => t.id === teamId)
    if (!team) return false
    const isOwn = user.id === playerId
    const isCaptain = team.captainId === user.id
    const isClubAdminForTeam = user.role === 'club_admin' && team.clubId === user.clubId
    return isOwn || isCaptain || isClubAdminForTeam
  }

  const isOverride = (playerId: string, teamId: string): 'captain' | 'club_admin' | undefined => {
    if (!user) return undefined
    const team = teams.find((t) => t.id === teamId)
    if (!team) return undefined
    if (user.id === playerId) return undefined
    if (team.captainId === user.id) return 'captain'
    if (user.role === 'club_admin' && team.clubId === user.clubId) return 'club_admin'
    return undefined
  }

  /** Captain (their team) or club admin (their club) can pick who plays. */
  const canEditGameSelection = (teamId: string): boolean => {
    if (!user) return false
    const team = teams.find((t) => t.id === teamId)
    if (!team) return false
    const isCaptain = team.captainId === user.id
    const isClubAdminForTeam = user.role === 'club_admin' && team.clubId === user.clubId
    return isCaptain || isClubAdminForTeam
  }

  /** Which team (home or away) this player is selected for in this game; null if none. */
  const getSelectedTeamForGame = (gameId: string, playerId: string): string | null => {
    const game = games.find((g) => g.id === gameId)
    if (!game) return null
    if (getGameSelectionPlayerIds(gameId, game.homeTeamId).includes(playerId)) return game.homeTeamId
    if (getGameSelectionPlayerIds(gameId, game.awayTeamId).includes(playerId)) return game.awayTeamId
    return null
  }

  /** Group IDs belonging to the selected phase (via divisions). */
  const phaseGroupIds = useMemo(() => {
    const divIds = new Set(divisions.filter((d) => d.phaseId === selectedPhaseId).map((d) => d.id))
    return new Set(groups.filter((g) => divIds.has(g.divisionId)).map((g) => g.id))
  }, [divisions, groups, selectedPhaseId])

  /**
   * Find all match-days with the same number across groups in the current phase
   * (same "round" in different groups).
   * A player can only play in one team per round, even if teams are in different groups.
   */
  const getCorrespondingMatchDayIds = (matchDayId: string): string[] => {
    const md = matchDays.find((m) => m.id === matchDayId)
    if (!md) return [matchDayId]
    return matchDays
      .filter((m) => m.number === md.number && phaseGroupIds.has(m.groupId))
      .map((m) => m.id)
  }

  /** Which team this player is selected for on this match-day round (across all groups); null if none. */
  const getSelectedTeamForMatchDay = (matchDayId: string, playerId: string): string | null => {
    const correspondingIds = getCorrespondingMatchDayIds(matchDayId)
    for (const mdId of correspondingIds) {
      for (const g of games.filter((x) => x.matchDayId === mdId)) {
        const t = getSelectedTeamForGame(g.id, playerId)
        if (t) return t
      }
    }
    return null
  }

  /**
   * Set which team this player is selected for on this match-day round.
   * Player can only be in one team's selection per round: we update all games across
   * corresponding match-days (same number, all groups) in one batch.
   */
  const setPlayerSelectedForMatchDay = (
    matchDayId: string,
    playerId: string,
    teamId: string | null
  ) => {
    const correspondingIds = getCorrespondingMatchDayIds(matchDayId)
    const allDayGames = games.filter((g) => correspondingIds.includes(g.matchDayId))
    const updates: Array<{ gameId: string; teamId: string; playerIds: string[] }> = []
    for (const game of allDayGames) {
      const homeIds = getGameSelectionPlayerIds(game.id, game.homeTeamId).filter((id) => id !== playerId)
      const awayIds = getGameSelectionPlayerIds(game.id, game.awayTeamId).filter((id) => id !== playerId)
      if (teamId === game.homeTeamId) homeIds.push(playerId)
      else if (teamId === game.awayTeamId) awayIds.push(playerId)
      updates.push(
        { gameId: game.id, teamId: game.homeTeamId, playerIds: homeIds },
        { gameId: game.id, teamId: game.awayTeamId, playerIds: awayIds }
      )
    }
    if (updates.length > 0) setGameSelectionBatch(updates)
  }

  // --- Mobile view (#306) -------------------------------------------------
  // Below md: the matrix is replaced by one card per team for a single
  // journée, so the two paginators collapse into one switcher over journée
  // numbers. Desktop keeps the matrix and its own controls untouched.
  const matchDayGroups = useMemo(
    () => (selectedPhaseId ? getPhaseMatchDays(selectedPhaseId, matchDays, groups, divisions) : []),
    [selectedPhaseId, matchDays, groups, divisions]
  )
  const [mobileMatchDayNumber, setMobileMatchDayNumber] = useState<number | null>(null)
  // Default — and re-default on phase change — to the active journée.
  const effectiveMatchDayNumber = mobileMatchDayNumber ?? activeMatchDayNumber(matchDayGroups)
  const mobileMatchDayIndex = matchDayGroups.findIndex((g) => g.number === effectiveMatchDayNumber)
  const mobileMatchDayGroup = matchDayGroups[mobileMatchDayIndex]

  const mobileEntries = useMemo<MatchDayCardEntry[]>(() => {
    if (!mobileMatchDayGroup) return []
    const roundIds = new Set(mobileMatchDayGroup.matchDays.map((m) => m.id))
    const entries: MatchDayCardEntry[] = []
    for (const team of myClubTeamsInPhase) {
      const game = games.find(
        (g) => roundIds.has(g.matchDayId) && (g.homeTeamId === team.id || g.awayTeamId === team.id)
      )
      if (!game) continue
      const matchDay = matchDays.find((m) => m.id === game.matchDayId)
      if (!matchDay) continue
      const isHome = game.homeTeamId === team.id
      const opponentId = isHome ? game.awayTeamId : game.homeTeamId
      const roster = (team.playerIds ?? [])
      entries.push({
        team,
        game,
        matchDay,
        opponentName: getTeamLabel(opponentId),
        isHome,
        dateLabel: formatMatchDayRange(gameDate(game, matchDay), gameDate(game, matchDay)),
        time: game.time ?? undefined,
        availableCount: roster.filter((pid) => getAvailability(game.id, pid) === 'available').length,
        selectedCount: getGameSelectionPlayerIds(game.id, team.id).length,
        playersPerGame: divisions.find((d) => d.id === team.divisionId)?.playersPerGame ?? 4,
      })
    }
    return entries
  }, [mobileMatchDayGroup, myClubTeamsInPhase, games, matchDays, divisions]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeMatchDayModal = () => {
    setEditingMatchDay(null)
    setCreatingMatchDay(false)
  }

  const handleSaveMatchDay = () => {
    if (creatingMatchDay && matchDayForm.groupId && matchDayForm.date) {
      addMatchDay({
        groupId: matchDayForm.groupId,
        number: matchDayForm.number,
        date: matchDayForm.date,
      })
      closeMatchDayModal()
    } else if (editingMatchDay) {
      updateMatchDay(editingMatchDay.id, {
        number: matchDayForm.number,
        date: matchDayForm.date,
      })
      closeMatchDayModal()
    }
  }

  const openGameEditModal = (teamId: string, matchDayId: string) => {
    const md = matchDays.find((m) => m.id === matchDayId)
    const team = teams.find((t) => t.id === teamId)
    const game = games.find(
      (g) =>
        g.matchDayId === matchDayId &&
        (g.homeTeamId === teamId || g.awayTeamId === teamId)
    )
    if (!md || !team) return
    setGameEditForm({
      date: game ? gameDate(game, md) : md.date,
      // The home club's time, never the viewing team's (#287).
      time: game
        ? gameSchedule(game, md, teams.find((t) => t.id === game.homeTeamId)).time
        : team.defaultTime ?? '',
      isHome: game ? game.homeTeamId === teamId : true,
      opponentTeamId: game
        ? game.homeTeamId === teamId
          ? game.awayTeamId
          : game.homeTeamId
        : '',
    })
    setGameEditModal({ teamId, matchDayId })
  }

  const closeGameEditModal = () => setGameEditModal(null)

  const handleSaveGameEdit = () => {
    if (!gameEditModal) return
    const { teamId, matchDayId } = gameEditModal
    const team = teams.find((t) => t.id === teamId)
    const matchDay = matchDays.find((m) => m.id === matchDayId)
    const game = games.find(
      (g) =>
        g.matchDayId === matchDayId &&
        (g.homeTeamId === teamId || g.awayTeamId === teamId)
    )
    if (!team || !matchDay) return
    const homeTeamId = gameEditForm.isHome ? teamId : gameEditForm.opponentTeamId
    const awayTeamId = gameEditForm.isHome ? gameEditForm.opponentTeamId : teamId
    if (!homeTeamId || !awayTeamId) {
      closeGameEditModal()
      return
    }
    if (game) {
      updateGame(game.id, {
        homeTeamId,
        awayTeamId,
        time: gameEditForm.time || undefined,
        date: gameEditForm.date || undefined,
      })
    } else {
      addGame({
        matchDayId,
        homeTeamId,
        awayTeamId,
        time: gameEditForm.time || undefined,
        date: gameEditForm.date || undefined,
      })
    }
    closeGameEditModal()
  }

  const gameEditModalTeam = gameEditModal
    ? teams.find((t) => t.id === gameEditModal.teamId)
    : null
  const gameEditModalMatchDay = gameEditModal
    ? matchDays.find((m) => m.id === gameEditModal!.matchDayId)
    : null
  const gameEditOpponentOptions = gameEditModalTeam
    ? teams.filter(
        (t) =>
          t.groupId === gameEditModalTeam.groupId && t.id !== gameEditModalTeam.id
      )
    : []

  const selectedPhaseIndex = phases.findIndex((p) => p.id === selectedPhaseId)
  const selectedPhase = phases[selectedPhaseIndex]

  const handlePhaseChange = (phaseId: string) => {
    autoPositionedPhaseRef.current = null // allow auto-positioning for new phase
    setSelectedPhaseId(phaseId)
    setMatchDayOffsetByTeamId({})
    setOtherMatchDayOffset(0)
    setGlobalMatchDayOffset(0)
    // Re-default the mobile journée to the new phase's active one, rather than
    // carrying over a number that may not exist there (#306).
    setMobileMatchDayNumber(null)
  }

  const scrollToTeam = (teamId: string) => {
    const anchor = `team-${teamId}`
    window.history.replaceState(null, '', `#${anchor}`)
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' })
  }

  const scrollToOtherPlayers = () => {
    window.history.replaceState(null, '', '#other-players')
    document.getElementById('other-players')?.scrollIntoView({ behavior: 'smooth' })
  }

  // Scroll to hash target or user's team on initial load
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    let target = hash
    if (!target && user?.isPlayer) {
      const userTeam = myClubTeamsInPhase.find((t) => t.playerIds?.includes(user.id))
      if (userTeam) target = `team-${userTeam.id}`
    }
    if (!target) return
    const timer = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' })
    }, 300)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Groups in this phase where we have at least one team (for "add match day" modal). */
  const groupOptionsInPhase = useMemo(() => {
    return groups.filter((g) => {
      const div = divisions.find((d) => d.id === g.divisionId)
      if (div?.phaseId !== selectedPhaseId) return false
      return g.teamIds.some((tid) => myClubTeamsInPhase.some((t) => t.id === tid))
    })
  }, [groups, divisions, selectedPhaseId, myClubTeamsInPhase])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Journées"
        club={scopedClub}
        actions={
          isAdmin && importableGroupIds.length > 0 ? (
            <button
              type="button"
              onClick={() => setImportGamesOpen(true)}
              title="Importer les matchs FFTT"
              aria-label="Importer les matchs FFTT"
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-600 text-white hover:bg-accent-700 md:h-9 md:w-9"
            >
              <ImportIcon className="h-4 w-4" />
            </button>
          ) : undefined
        }
        controls={
          <>
            {/* Phase switcher. Below md: a select — two 44px chevrons plus the
                full "2025/2026 Phase 1" label needs 230px, and with the journée
                switcher beside it the row overflowed a 375px screen. A select
                carries the same label in 60px less, and a phase is something
                you change once a season. */}
            <label className="min-w-0 flex-1 md:hidden">
              <span className="sr-only">Phase</span>
              <select
                value={selectedPhaseId ?? ''}
                onChange={(e) => handlePhaseChange(e.target.value)}
                className="h-11 w-full rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
              >
                {phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.displayName}
                  </option>
                ))}
              </select>
            </label>

            <div className="hidden h-9 items-center gap-2 rounded border border-slate-200 bg-white px-2 md:flex">
              <button
                type="button"
                onClick={() => handlePhaseChange(phases[selectedPhaseIndex - 1].id)}
                disabled={selectedPhaseIndex <= 0}
                className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                aria-label="Phase précédente"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="whitespace-nowrap text-xs font-medium text-slate-700 tabular-nums">
                {selectedPhase?.displayName ?? '—'}
              </span>
              <button
                type="button"
                onClick={() => handlePhaseChange(phases[selectedPhaseIndex + 1].id)}
                disabled={selectedPhaseIndex >= phases.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                aria-label="Phase suivante"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Journée switcher — the single navigation control below md:,
                where the matrix (and its two paginators) is replaced by the
                card list (#306). */}
            {mobileMatchDayGroup && (
              <div className="flex h-11 shrink-0 items-center gap-1 rounded border border-slate-200 bg-white px-1 md:hidden">
                <button
                  type="button"
                  onClick={() => setMobileMatchDayNumber(matchDayGroups[mobileMatchDayIndex - 1].number)}
                  disabled={mobileMatchDayIndex <= 0}
                  className="flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Journée précédente"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="whitespace-nowrap text-xs font-medium text-slate-700 tabular-nums">
                  {/* "J8" matches the matrix's own column headers, and keeps the
                      row inside 375px next to the phase select. */}
                  <span className="sm:hidden">J{mobileMatchDayGroup.number}</span>
                  <span className="hidden sm:inline">Journée {mobileMatchDayGroup.number}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMatchDayNumber(matchDayGroups[mobileMatchDayIndex + 1].number)}
                  disabled={mobileMatchDayIndex >= matchDayGroups.length - 1}
                  className="flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Journée suivante"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}

            {/* Team shortcuts — matrix-only: they jump between the per-team
                tables, which do not exist below md:. */}
            {myClubTeamsInPhase.length > 0 && (
              <div className="hidden items-center gap-1 md:flex">
                <span className="mr-1 whitespace-nowrap text-xs text-slate-500">Aller à</span>
                {myClubTeamsInPhase.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => scrollToTeam(t.id)}
                    className="h-11 min-w-11 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700 md:h-9 md:min-w-0"
                  >
                    {t.number}
                  </button>
                ))}
                {otherPlayers.length > 0 && (
                  <button
                    type="button"
                    onClick={scrollToOtherPlayers}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700 md:h-9"
                  >
                    Autres
                  </button>
                )}
              </div>
            )}

            {/* Global match-day switcher — matrix-only, see above. */}
            {globalMaxMatchDays > VISIBLE_MATCH_DAY_COUNT && (
              <div className="hidden h-9 items-center gap-2 rounded border border-slate-200 bg-white px-2 md:flex">
                <button
                  type="button"
                  onClick={() => setGlobalOffset(globalMatchDayOffset - 1)}
                  disabled={globalMatchDayOffset <= 0}
                  className="flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40 md:h-7 md:w-7"
                  aria-label="Journées précédentes (toutes équipes)"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="whitespace-nowrap text-xs text-slate-600 tabular-nums">
                  {globalMatchDayOffset + 1}–{Math.min(globalMatchDayOffset + VISIBLE_MATCH_DAY_COUNT, globalMaxMatchDays)} / {globalMaxMatchDays}
                </span>
                <button
                  type="button"
                  onClick={() => setGlobalOffset(globalMatchDayOffset + 1)}
                  disabled={globalMatchDayOffset >= globalMaxOffset}
                  className="flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40 md:h-7 md:w-7"
                  aria-label="Journées suivantes (toutes équipes)"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </>
        }
      />

      {importGamesOpen && (
        <ImportGamesModal
          onClose={() => setImportGamesOpen(false)}
          groupIds={importableGroupIds}
          clubId={importScopeClubId}
          context={`${selectedPhase?.displayName ?? ''} — toutes les poules avec équipes`}
        />
      )}

      {selectedPhaseId && myClubTeamsInPhase.length === 0 && (
        <p className="text-sm text-slate-600">Aucune équipe de votre club dans cette phase.</p>
      )}

      {/* Mobile: one card per team for the selected journée. The matrix below
          is 964px of columns and cannot fit a phone (#306). */}
      {myClubTeamsInPhase.length > 0 && (
        <div className="md:hidden">
          <MatchDayCards entries={mobileEntries} />
        </div>
      )}

      {/* Desktop: the per-team matrix, unchanged. */}
      <div className="hidden flex-col gap-6 md:flex">

      {myClubTeamsInPhase.map((team) => {
        const groupMatchDays = getMatchDaysForTeam(team.id)
        const offset = matchDayOffsetByTeamId[team.id] ?? 0
        const visibleMatchDays = groupMatchDays.slice(offset, offset + VISIBLE_MATCH_DAY_COUNT)
        const maxOffset = Math.max(0, groupMatchDays.length - VISIBLE_MATCH_DAY_COUNT)
        const roster = sortByName(
          (team.playerIds ?? [])
            .map((pid) => players.find((p) => p.id === pid))
            .filter((p): p is Player => p != null),
        )

        const teamGamesCount = groupMatchDays.filter((md) =>
          games.some(
            (g) =>
              g.matchDayId === md.id && (g.homeTeamId === team.id || g.awayTeamId === team.id)
          )
        ).length

        return (
          <section
            key={team.id}
            id={`team-${team.id}`}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white scroll-mt-[var(--page-scroll-offset)]"
          >
            <div
              className="border-b border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-4"
              style={
                team.color
                  ? { borderLeftWidth: '4px', borderLeftColor: team.color }
                  : undefined
              }
            >
              <h2 className="font-display text-lg font-medium text-slate-800 flex items-center gap-2">
                {team.color && (
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: team.color }}
                    aria-hidden
                  />
                )}
                {getTeamLabel(team.id)}
              </h2>
              {groupMatchDays.length > VISIBLE_MATCH_DAY_COUNT && (
                <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1">
                  <button
                    type="button"
                    onClick={() =>
                      setMatchDayOffsetByTeamId((prev) => ({
                        ...prev,
                        [team.id]: Math.max(0, (prev[team.id] ?? 0) - 1),
                      }))
                    }
                    disabled={offset <= 0}
                    className="flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40 md:h-7 md:w-7"
                    aria-label="Journées précédentes"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-xs text-slate-600 tabular-nums">
                    {offset + 1}–{Math.min(offset + VISIBLE_MATCH_DAY_COUNT, groupMatchDays.length)} / {groupMatchDays.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setMatchDayOffsetByTeamId((prev) => ({
                        ...prev,
                        [team.id]: Math.min(maxOffset, (prev[team.id] ?? 0) + 1),
                      }))
                    }
                    disabled={offset >= maxOffset}
                    className="flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40 md:h-7 md:w-7"
                    aria-label="Journées suivantes"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {groupMatchDays.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                Aucune journée pour cette équipe. Ajoutez une journée au groupe concerné.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table
                    className="w-full border-collapse text-sm table-fixed"
                    style={{
                      minWidth:
                        TABLE_COL_WIDTHS.joueur +
                        TABLE_COL_WIDTHS.dispo +
                        TABLE_COL_WIDTHS.joues +
                        TABLE_COL_WIDTHS.brulage +
                        visibleMatchDays.length *
                          (TABLE_COL_WIDTHS.matchDayDispo + TABLE_COL_WIDTHS.matchDayCompo),
                    }}
                  >
                    <MatchDayColgroup matchDayCount={visibleMatchDays.length} />
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">
                          Joueur
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">
                          Dispo
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">
                          Joués
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">
                          Brûlage
                        </th>
                        {visibleMatchDays.map((md) => {
                          const game = games.find(
                            (g) =>
                              g.matchDayId === md.id &&
                              (g.homeTeamId === team.id || g.awayTeamId === team.id)
                          )
                          const opponentId = game
                            ? game.homeTeamId === team.id
                              ? game.awayTeamId
                              : game.homeTeamId
                            : null
                          const isHome = game ? game.homeTeamId === team.id : false
                          // An away fixture is played at the opponent's venue
                          // on their day, so its slot is not this club's to
                          // set (#294). A general admin manages every club and
                          // keeps both; a club admin only gets its home games.
                          const canEditSlot = isAdmin && (user?.role === 'general_admin' || isHome)
                          return (
                            <th
                              key={md.id}
                              colSpan={2}
                              {...(canEditSlot ? {
                                role: 'button',
                                tabIndex: 0,
                                onClick: () => openGameEditModal(team.id, md.id),
                                onKeyDown: (e: React.KeyboardEvent) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    openGameEditModal(team.id, md.id)
                                  }
                                },
                                title: undefined,
                              } : {
                                title: game ? 'Match à l’extérieur : la date et l’heure sont fixées par le club recevant.' : undefined,
                              })}
                              className={`whitespace-nowrap border-l border-slate-200 px-2 py-2 text-center font-medium text-slate-700 ${canEditSlot ? 'cursor-pointer hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-inset' : ''}`}
                            >
                              <span className="block">J{md.number}</span>
                              {game ? (
                                <>
                                  {/* A fixture only has a real slot once the
                                      HOME club's playing day is known (#287).
                                      Otherwise all we honestly have is the
                                      journée's week — showing the FFTT nominal
                                      date next to the viewing team's default
                                      time claimed a slot nobody confirmed. */}
                                  {(() => {
                                    const sched = gameSchedule(
                                      game, md, teams.find((t) => t.id === game.homeTeamId),
                                    )
                                    const short = (iso: string) =>
                                      new Date(iso + 'Z').toLocaleDateString('fr-FR', {
                                        weekday: 'short', day: 'numeric', month: 'short',
                                      })
                                    return sched.date ? (
                                      <span className="block text-xs font-normal text-slate-500">
                                        {short(sched.date)}
                                        {sched.time && <span className="ml-1">{sched.time}</span>}
                                        {/* Agreed between clubs rather than imported (#294) — worth
                                            seeing, since no import will overwrite it. */}
                                        {game.source === 'manual' && (
                                          <span
                                            className="ml-1 text-accent-600"
                                            title="Date et heure fixées manuellement : conservées lors des imports."
                                          >
                                            <span aria-hidden="true">✎</span>
                                            <span className="sr-only">Modifié manuellement</span>
                                          </span>
                                        )}
                                      </span>
                                    ) : sched.week ? (
                                      <span
                                        className="block text-xs font-normal text-amber-700"
                                        title="Date et heure non confirmées : le jour de jeu du club recevant n’est pas connu."
                                      >
                                        <span aria-hidden="true">⚠ </span>
                                        <span className="sr-only">Date à confirmer, </span>
                                        {short(sched.week.start)} – {short(sched.week.end)}
                                      </span>
                                    ) : null
                                  })()}
                                  {opponentId && (
                                    <span className="mt-0.5 flex items-center justify-center gap-1 text-xs text-slate-600">
                                      <span
                                        className="shrink-0 text-slate-500"
                                        title={isHome ? 'Domicile' : 'Extérieur'}
                                      >
                                        {isHome ? (
                                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                          </svg>
                                        ) : (
                                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                                          </svg>
                                        )}
                                      </span>
                                      {getTeamLabel(opponentId)}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="block text-xs font-normal text-slate-400 italic">Exempt</span>
                              )}
                            </th>
                          )
                        })}
                      </tr>
                      <tr className="border-b border-slate-200 bg-slate-50/50 text-xs text-slate-600">
                        <th colSpan={4} className="px-3 py-1"></th>
                        {visibleMatchDays.map((md) => (
                          <Fragment key={md.id}>
                            <th className="border-l border-slate-200 px-1 py-1 text-center font-normal">
                              Dispo
                            </th>
                            <th className="border-l border-slate-200 px-1 py-1 text-center font-normal">
                              Compo
                            </th>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((player) => {
                        const availCount = groupMatchDays.filter((md) => {
                          const game = games.find(
                            (g) =>
                              g.matchDayId === md.id &&
                              (g.homeTeamId === team.id || g.awayTeamId === team.id)
                          )
                          if (!game) return false
                          const s = getAvailability(game.id, player.id)
                          return s === 'available'
                        }).length
                        const selectedCount = groupMatchDays.filter((md) => {
                          const game = games.find(
                            (g) =>
                              g.matchDayId === md.id &&
                              (g.homeTeamId === team.id || g.awayTeamId === team.id)
                          )
                          return game && getGameSelectionPlayerIds(game.id, team.id).includes(player.id)
                        }).length
                        const brulage = computeBrulage(
                          player.id,
                          myClubTeamsInPhase,
                          matchDays,
                          games,
                          gameSelections,
                        )
                        const brulageColor = brulage.burnedIntoTeamId
                          ? getTeamColor(brulage.burnedIntoTeamId)
                          : undefined
                        const brulageTeam = brulage.burnedIntoTeamId
                          ? teams.find((t) => t.id === brulage.burnedIntoTeamId)
                          : null
                        return (
                          <tr key={player.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-3 py-1.5 text-slate-800">
                              <span className={`block font-medium ${player.id === team.captainId ? 'font-bold' : ''}`}>
                                {player.firstName} {player.lastName}
                                {(() => {
                                  const pts = team.rosterInitialPoints?.[player.id]
                                  return pts ? <span className="ml-1 text-slate-500 font-normal">({pts})</span> : null
                                })()}
                              </span>
                              {player.licenseNumber && (
                                <span className="block text-xs text-slate-400">{player.licenseNumber}</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-center text-slate-600">
                              {availCount}/{teamGamesCount}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-center text-slate-600">
                              {selectedCount}/{teamGamesCount}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-center text-slate-600 text-xs">
                              {brulageTeam ? (
                                <span className="inline-flex items-center gap-1">
                                  {brulageColor && (
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: brulageColor }}
                                      aria-hidden
                                    />
                                  )}
                                  Équipe {brulageTeam.number}
                                </span>
                              ) : '—'}
                            </td>
                            {visibleMatchDays.map((md) => {
                              const game = games.find(
                                (g) =>
                                  g.matchDayId === md.id &&
                                  (g.homeTeamId === team.id || g.awayTeamId === team.id)
                              )
                              if (!game) {
                                const correspondingMdIds = getCorrespondingMatchDayIds(md.id)
                                const dayGames = games.filter((g) => correspondingMdIds.includes(g.matchDayId))
                                const ourClubTeamsThisDay = [
                                  ...new Set(
                                    dayGames.flatMap((g) =>
                                      [g.homeTeamId, g.awayTeamId].filter(
                                        (tid) => teams.find((t) => t.id === tid)?.clubId === user?.clubId
                                      )
                                    )
                                  ),
                                ]
                                const selectedTeamId = getSelectedTeamForMatchDay(md.id, player.id)
                                const canEditSel = ourClubTeamsThisDay.some((tid) =>
                                  canEditGameSelection(tid)
                                )
                                return (
                                  <Fragment key={md.id}>
                                    <td className="border-l border-slate-100 px-2 py-1.5 text-center text-slate-400">
                                      —
                                    </td>
                                    <td className="border-l border-slate-100 px-2 py-1.5">
                                      {canEditSel && myClubTeamsInPhase.length > 0 ? (
                                        <TeamSelect
                                          value={selectedTeamId}
                                          onChange={(v) =>
                                            setPlayerSelectedForMatchDay(md.id, player.id, v)
                                          }
                                          optionIds={orderedTeamOptionIds(team.id, player.id, md.id)}
                                          getLabel={getTeamSelectLabel}
                                          getColor={getTeamColor}
                                        />
                                      ) : (
                                        <ReadOnlyCompo teamId={selectedTeamId} getLabel={getTeamSelectLabel} getColor={getTeamColor} />
                                      )}
                                    </td>
                                  </Fragment>
                                )
                              }
                              const status = getAvailability(game.id, player.id)
                              const mdPast = isMatchDayPast(md.id)
                              const canEditAv = !mdPast && canEditAvailability(player.id, team.id)
                              const selectedTeamId = getSelectedTeamForMatchDay(md.id, player.id)
                              const canEditSel = canEditGameSelection(team.id)
                              return (
                                <Fragment key={md.id}>
                                  <td className="border-l border-slate-100 px-2 py-1.5">
                                    {canEditAv ? (
                                      <AvailabilitySelect
                                        value={status}
                                        onChange={(v) => {
                                          if (v) setGameAvailability(game.id, player.id, v, isOverride(player.id, team.id))
                                          else if (status) clearGameAvailability(game.id, player.id)
                                        }}
                                      />
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                                        {status ? (
                                          <>
                                            <span
                                              className="shrink-0 w-2.5 h-2.5 rounded-full"
                                              style={{ backgroundColor: AVAILABILITY_COLORS[status] }}
                                              aria-hidden
                                            />
                                            {AVAILABILITY_LABELS[status]}
                                          </>
                                        ) : '—'}
                                      </span>
                                    )}
                                  </td>
                                  <td key={`${md.id}-sel`} className="border-l border-slate-100 px-2 py-1.5">
                                    {canEditSel && myClubTeamsInPhase.length > 0 ? (
                                      <TeamSelect
                                        value={selectedTeamId}
                                        onChange={(v) =>
                                          setPlayerSelectedForMatchDay(md.id, player.id, v)
                                        }
                                        optionIds={orderedTeamOptionIds(team.id, player.id, md.id)}
                                        getLabel={getTeamSelectLabel}
                                        getColor={getTeamColor}
                                      />
                                    ) : (
                                      <ReadOnlyCompo teamId={selectedTeamId} getLabel={getTeamSelectLabel} getColor={getTeamColor} />
                                    )}
                                  </td>
                                </Fragment>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-700">
                        <td colSpan={4} className="px-3 py-2">
                          Résumé
                        </td>
                        {visibleMatchDays.map((md) => {
                          const game = games.find(
                            (g) =>
                              g.matchDayId === md.id &&
                              (g.homeTeamId === team.id || g.awayTeamId === team.id)
                          )
                          const required =
                            divisions.find((d) => d.id === team.divisionId)?.playersPerGame ?? 4
                          if (!game) {
                            return (
                              <Fragment key={md.id}>
                                <td className="border-l border-slate-200 px-2 py-2 text-center">—</td>
                                <td className="border-l border-slate-200 px-2 py-2 text-center">—</td>
                              </Fragment>
                            )
                          }
                          const availableCount = roster.filter(
                            (p) => getAvailability(game.id, p.id) === 'available'
                          ).length
                          const selectedCount = getGameSelectionPlayerIds(game.id, team.id).length
                          const availOk = availableCount >= required
                          const compoOk = selectedCount === required
                          return (
                            <Fragment key={md.id}>
                              <td
                                className={`border-l border-slate-200 px-2 py-2 text-center font-medium ${
                                  availOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {availableCount}/{required}
                              </td>
                              <td
                                className={`border-l border-slate-200 px-2 py-2 text-center font-medium ${
                                  compoOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {selectedCount}/{required}
                              </td>
                            </Fragment>
                          )
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </section>
        )
      })}
      </div>


      {/* Other players (club, not in any team roster). Another matrix, so it is
          desktop-only like the per-team ones; on mobile a borrowed player shows
          up in the detail of the team they were picked for (#306). */}
      {otherPlayers.length > 0 && otherGroupMatchDays.length > 0 && (
        <div className="hidden md:block">
        <section id="other-players" className="overflow-hidden rounded-xl border border-slate-200 bg-white scroll-mt-[var(--page-scroll-offset)]">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="font-display text-lg font-medium text-slate-800">
              Autres joueurs du club
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Joueurs non rattachés à une équipe ; uniquement la composition (équipe retenue) par match.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-b border-slate-100 px-4 py-2">
            {otherGroupMatchDays.length > VISIBLE_MATCH_DAY_COUNT && (
              <>
                <button
                  type="button"
                  onClick={() => setOtherMatchDayOffset((o) => Math.max(0, o - 1))}
                  disabled={otherMatchDayOffset <= 0}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Journées précédentes"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-xs text-slate-500">
                  {otherMatchDayOffset + 1}–{Math.min(otherMatchDayOffset + VISIBLE_MATCH_DAY_COUNT, otherGroupMatchDays.length)} / {otherGroupMatchDays.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setOtherMatchDayOffset((o) =>
                      Math.min(Math.max(0, otherGroupMatchDays.length - VISIBLE_MATCH_DAY_COUNT), o + 1)
                    )
                  }
                  disabled={otherMatchDayOffset >= Math.max(0, otherGroupMatchDays.length - VISIBLE_MATCH_DAY_COUNT)}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Journées suivantes"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>
          <div className="overflow-x-auto">
            {(() => {
              const otherVisibleMatchDays = otherGroupMatchDays.slice(
                otherMatchDayOffset,
                otherMatchDayOffset + VISIBLE_MATCH_DAY_COUNT
              )
              const otherMinWidth =
                TABLE_COL_WIDTHS.joueur +
                TABLE_COL_WIDTHS.dispo +
                TABLE_COL_WIDTHS.joues +
                TABLE_COL_WIDTHS.brulage +
                otherVisibleMatchDays.length *
                  (TABLE_COL_WIDTHS.matchDayDispo + TABLE_COL_WIDTHS.matchDayCompo)
              return (
            <table
              className="w-full border-collapse text-sm table-fixed"
              style={{ minWidth: otherMinWidth }}
            >
              <MatchDayColgroup matchDayCount={otherVisibleMatchDays.length} />
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">
                    Joueur
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">
                    Dispo
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">
                    Joués
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">
                    Brûlage
                  </th>
                  {otherVisibleMatchDays.map((md) => (
                      <th
                        key={md.id}
                        colSpan={2}
                        className="whitespace-nowrap border-l border-slate-200 px-2 py-2 text-center font-medium text-slate-700"
                      >
                        J{md.number}
                        <span className="block text-xs font-normal text-slate-500">
                          {new Date(md.date + 'Z').toLocaleDateString('fr-FR', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </th>
                    ))}
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-xs text-slate-600">
                  <th colSpan={4} className="px-3 py-1"></th>
                  {otherVisibleMatchDays.map((md) => (
                    <Fragment key={md.id}>
                      <th className="border-l border-slate-200 px-1 py-1 text-center font-normal">
                        Dispo
                      </th>
                      <th className="border-l border-slate-200 px-1 py-1 text-center font-normal">
                        Compo
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {otherPlayers.map((player) => (
                  <tr key={player.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-1.5 text-slate-800">
                      <span className="block font-medium">
                        {player.firstName} {player.lastName}
                      </span>
                      {player.licenseNumber && (
                        <span className="block text-xs text-slate-400">{player.licenseNumber}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-slate-400">—</td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-slate-400">—</td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-slate-600 text-xs">
                      {(() => {
                        const b = computeBrulage(player.id, myClubTeamsInPhase, matchDays, games, gameSelections)
                        if (!b.burnedIntoTeamId) return '—'
                        const bTeam = teams.find((t) => t.id === b.burnedIntoTeamId)
                        const bColor = getTeamColor(b.burnedIntoTeamId)
                        return bTeam ? (
                          <span className="inline-flex items-center gap-1">
                            {bColor && (
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: bColor }}
                                aria-hidden
                              />
                            )}
                            Équipe {bTeam.number}
                          </span>
                        ) : '—'
                      })()}
                    </td>
                    {otherVisibleMatchDays.map((md) => {
                        const dayGames = games.filter((g) => g.matchDayId === md.id)
                        const ourClubTeamsThisDay = [
                          ...new Set(
                            dayGames.flatMap((g) =>
                              [g.homeTeamId, g.awayTeamId].filter(
                                (tid) => teams.find((t) => t.id === tid)?.clubId === user?.clubId
                              )
                            )
                          ),
                        ]
                        const selectedTeamId = getSelectedTeamForMatchDay(md.id, player.id)
                        const canEditSel = ourClubTeamsThisDay.some((tid) =>
                          canEditGameSelection(tid)
                        )
                        return (
                          <Fragment key={md.id}>
                            <td className="border-l border-slate-100 px-2 py-1.5 text-center text-slate-400">
                              —
                            </td>
                            <td className="border-l border-slate-100 px-2 py-1.5">
                              {canEditSel && myClubTeamsInPhase.length > 0 ? (
                                <TeamSelect
                                  value={selectedTeamId}
                                  onChange={(v) =>
                                    setPlayerSelectedForMatchDay(md.id, player.id, v)
                                  }
                                  optionIds={orderedTeamOptionIds(null, player.id, md.id)}
                                  getLabel={getTeamSelectLabel}
                                  getColor={getTeamColor}
                                />
                              ) : (
                                <ReadOnlyCompo teamId={selectedTeamId} getLabel={getTeamSelectLabel} getColor={getTeamColor} />
                              )}
                            </td>
                          </Fragment>
                        )
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
              );
            })()}
          </div>
        </section>
        </div>
      )}

      {/* Create / Edit match-day modal */}
      {(editingMatchDay || creatingMatchDay) && (
        <ModalShell
          onClose={closeMatchDayModal}
          labelledBy="matchday-modal-title"
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 id="matchday-modal-title" className="font-display text-lg font-semibold text-slate-800">
              {creatingMatchDay ? 'Ajouter une journée' : 'Modifier la journée'}
            </h2>
            <div className="mt-4 space-y-4">
              {creatingMatchDay && (
                <div>
                  <label htmlFor="md-group" className="block text-sm font-medium text-slate-700">
                    Groupe
                  </label>
                  <select
                    id="md-group"
                    value={matchDayForm.groupId}
                    onChange={(e) =>
                      setMatchDayForm((f) => ({ ...f, groupId: e.target.value }))
                    }
                    className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                  >
                    <option value="">—</option>
                    {groupOptionsInPhase.map((g) => (
                      <option key={g.id} value={g.id}>
                        {getGroupLabel(g.id)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!creatingMatchDay && editingMatchDay && (
                <div>
                  <span className="block text-sm font-medium text-slate-700">Groupe</span>
                  <p className="mt-1 text-sm text-slate-900">
                    {getGroupLabel(editingMatchDay.groupId)}
                  </p>
                </div>
              )}
              <div>
                <label htmlFor="md-number" className="block text-sm font-medium text-slate-700">
                  Numéro de journée
                </label>
                <input
                  id="md-number"
                  type="number"
                  min={1}
                  value={matchDayForm.number}
                  onChange={(e) =>
                    setMatchDayForm((f) => ({ ...f, number: Number(e.target.value) || 1 }))
                  }
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
              <div>
                <label htmlFor="md-date" className="block text-sm font-medium text-slate-700">
                  Date
                </label>
                <input
                  id="md-date"
                  type="date"
                  value={matchDayForm.date}
                  onChange={(e) => setMatchDayForm((f) => ({ ...f, date: e.target.value }))}
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeMatchDayModal}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveMatchDay}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Game edit modal — opened by clicking J1, J2, … in a team table */}
      {gameEditModal && gameEditModalTeam && gameEditModalMatchDay && (
        <ModalShell
          onClose={closeGameEditModal}
          labelledBy="game-edit-modal-title"
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 id="game-edit-modal-title" className="font-display text-lg font-semibold text-slate-800">
              {games.some(
                (g) =>
                  g.matchDayId === gameEditModal.matchDayId &&
                  (g.homeTeamId === gameEditModal.teamId || g.awayTeamId === gameEditModal.teamId)
              )
                ? 'Modifier le match'
                : 'Créer le match'
              }
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {getTeamLabel(gameEditModal.teamId)} — J{gameEditModalMatchDay.number}
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="game-edit-date" className="block text-sm font-medium text-slate-700">
                  Date
                </label>
                <input
                  id="game-edit-date"
                  type="date"
                  value={gameEditForm.date}
                  onChange={(e) =>
                    setGameEditForm((f) => ({ ...f, date: e.target.value }))
                  }
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
              <div>
                <label htmlFor="game-edit-time" className="block text-sm font-medium text-slate-700">
                  Heure
                </label>
                <input
                  id="game-edit-time"
                  type="text"
                  placeholder="20h00"
                  value={gameEditForm.time}
                  onChange={(e) =>
                    setGameEditForm((f) => ({ ...f, time: e.target.value }))
                  }
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
              </div>
              <div>
                <span className="block text-sm font-medium text-slate-700 mb-1">Domicile / Extérieur</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGameEditForm((f) => ({ ...f, isHome: true }))}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      gameEditForm.isHome
                        ? 'border-accent-600 bg-accent-50 text-accent-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                    </svg>
                    Domicile
                  </button>
                  <button
                    type="button"
                    onClick={() => setGameEditForm((f) => ({ ...f, isHome: false }))}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      !gameEditForm.isHome
                        ? 'border-accent-600 bg-accent-50 text-accent-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                    Extérieur
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="game-edit-opponent" className="block text-sm font-medium text-slate-700">
                  Adversaire
                </label>
                <select
                  id="game-edit-opponent"
                  value={gameEditForm.opponentTeamId}
                  onChange={(e) =>
                    setGameEditForm((f) => ({ ...f, opponentTeamId: e.target.value }))
                  }
                  className="mt-1 w-full min-h-[44px] md:min-h-0 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                >
                  <option value="">—</option>
                  {gameEditOpponentOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {getTeamLabel(t.id)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeGameEditModal}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveGameEdit}
                disabled={!gameEditForm.opponentTeamId}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
