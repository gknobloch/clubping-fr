import { useMemo, useState } from 'react'
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { orderPhases, defaultPhase } from '@shared/lib/phases'
import { getTeamName } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { getPhaseMatchDays, activeMatchDayNumber, formatMatchDayRange, gameDate, gameTime, isSlotConfirmed } from '@/utils/matchdays'
import { Screen, contentWidth } from '@/components/Screen'
import { MatchHeader } from '@/components/MatchHeader'
import { Switcher } from '@/components/Switcher'
import { AvailabilitySheet } from '@/components/AvailabilitySheet'
import {
  MatchDayMatrix,
  matrixColumns,
  visibleMatchDayCount,
  type MatrixDay,
  type MatrixRow,
} from '@/components/MatchDayMatrix'
import { useLayout } from '@/constants/layout'
import { canEditAvailability, availabilityOverride } from '@/utils/roles'
import { sortByName } from '@shared/lib/sortByName'
import { computeBrulage } from '@shared/lib/brulage'
import { pointsFor } from '@shared/lib/phasePoints'
import type { AvailabilityStatus, Game, MatchDay, Player, Team } from '@shared/types'
import { fonts } from '@/constants/typography'

// ---------------------------------------------------------------------------
// Match card — consistent with the Accueil next-match header
// ---------------------------------------------------------------------------
function MatchCard({
  team, teamName, label, mine, divisionLabel, playersPerGame,
  matchDayNumber, matchDayDate, time, confirmed, opponentName, isHome, selectedCount, availableCount, onPress,
}: {
  team: Team; teamName: string; label?: string; mine?: boolean
  divisionLabel?: string; playersPerGame: number
  matchDayNumber: number; matchDayDate: string
  /** The receiving club's time — absent when its playing day is unknown (#287). */
  time?: string
  confirmed: boolean
  opponentName: string; isHome: boolean
  selectedCount: number; availableCount: number | null; onPress: () => void
}) {
  const short = selectedCount < playersPerGame || (availableCount !== null && availableCount < playersPerGame)
  return (
    <TouchableOpacity style={[mc.card, mine && mc.cardMine]} onPress={onPress} activeOpacity={0.7}>
      <View style={mc.body}>
        <MatchHeader
          matchDayNumber={matchDayNumber}
          divisionLabel={divisionLabel}
          teamColor={team.color}
          teamNumber={team.number}
          isHome={isHome}
          teamName={teamName}
          opponentName={opponentName}
          matchDayDate={matchDayDate}
          time={time}
          confirmed={confirmed}
          label={label}
          labelMine={!!mine && label === 'Mon équipe'}
        />
        <Text style={[mc.status, short && mc.statusWarn]}>
          {availableCount !== null ? `${availableCount} dispo · ` : ''}Compo {selectedCount}/{playersPerGame}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  )
}

const mc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  cardMine: { borderWidth: 2, borderColor: colors.accent },
  body: { flex: 1, gap: 8 },
  status: { fontSize: 13, color: colors.textSecondary },
  statusWarn: { color: colors.warning, fontFamily: fonts.semiBold },
})

/** «sam. 17 janv.» — the slot's own date, once the receiving club has set one. */
function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function JourneesScreen() {
  const { user } = useAuth()
  const {
    clubs, teams, players, matchDays, games, phases, divisions, groups,
    gameAvailabilities, gameSelections, playerPhasePoints,
    setAvailability, clearAvailability, refreshing, refresh,
  } = useAppData()
  const router = useRouter()

  const myClubId = user?.clubId
  const myPlayerId = user?.isPlayer ? user.id : undefined

  // Phases ordered for the < > switcher (chronological by name); default active.
  const orderedPhases = useMemo(() => orderPhases(phases), [phases])
  const fallbackPhase = useMemo(() => defaultPhase(phases), [phases])
  const [phaseId, setPhaseId] = useState<string | undefined>(undefined)
  const phase = phases.find((p) => p.id === phaseId) ?? fallbackPhase
  const phaseIndex = orderedPhases.findIndex((p) => p.id === phase?.id)

  const clubTeams = useMemo(
    () => (phase ? teams.filter((t) => t.clubId === myClubId && t.phaseId === phase.id) : []),
    [phase, teams, myClubId],
  )

  // Scoped to the club's teams and their games' own dates: the switcher's
  // subtitle has to describe the cards below it, not every poule of the phase
  // (#450).
  const matchDayGroups = useMemo(
    () =>
      phase
        ? getPhaseMatchDays(phase.id, matchDays, groups, divisions, {
            games,
            teamIds: clubTeams.map((t) => t.id),
          })
        : [],
    [phase, matchDays, groups, divisions, games, clubTeams],
  )

  const [mdNumber, setMdNumber] = useState<number | null>(null)
  // Default (and re-default on phase change) to the active match-day.
  const effectiveMdNumber = mdNumber ?? activeMatchDayNumber(matchDayGroups)
  const mdIndex = matchDayGroups.findIndex((g) => g.number === effectiveMdNumber)
  const mdGroup = matchDayGroups[mdIndex]

  function selectPhase(next: number) {
    const p = orderedPhases[next]
    if (!p) return
    setPhaseId(p.id)
    setMdNumber(null) // reset to the new phase's active match-day
  }

  // Division / playersPerGame helpers
  const divLabel = (team: Team) => {
    const g = groups.find((x) => x.id === team.groupId)
    return g ? divisions.find((d) => d.id === g.divisionId)?.displayName : undefined
  }
  const perGame = (team: Team) => {
    const g = groups.find((x) => x.id === team.groupId)
    return (g ? divisions.find((d) => d.id === g.divisionId)?.playersPerGame : undefined) ?? 4
  }

  // Club teams + their games for the selected match-day.
  const clubGames = useMemo(() => {
    if (!phase || !mdGroup) return [] as { team: Team; game: Game }[]
    const roundMdIds = new Set(mdGroup.matchDays.map((m) => m.id))
    const result: { team: Team; game: Game }[] = []
    for (const team of clubTeams) {
      const game = games.find(
        (g) => roundMdIds.has(g.matchDayId) && (g.homeTeamId === team.id || g.awayTeamId === team.id),
      )
      if (game) result.push({ team, game })
    }
    return result.sort((a, b) => a.team.number - b.team.number)
  }, [phase, mdGroup, clubTeams, games])

  // Which teams am I playing for this match-day (roster team + any that borrowed me)?
  const mineLabel = useMemo(() => {
    const map = new Map<string, string>()
    if (!myPlayerId) return map
    for (const { team, game } of clubGames) {
      if (team.playerIds.includes(myPlayerId)) map.set(team.id, 'Mon équipe')
      else {
        const sel = gameSelections.find((s) => s.teamId === team.id && s.gameId === game.id)
        if (sel?.playerIds.includes(myPlayerId)) map.set(team.id, 'Renfort')
      }
    }
    return map
  }, [clubGames, gameSelections, myPlayerId])

  const mine = clubGames.filter((cg) => mineLabel.has(cg.team.id))
  const others = clubGames.filter((cg) => !mineLabel.has(cg.team.id))

  // -------------------------------------------------------------------------
  // La matrice, au-dessus du seuil tablette (#468)
  //
  // The phone shows one journée at a time; a slab shows two or three at once,
  // per team, which is the whole point — «qui est dispo sur les prochaines
  // journées» is a question the stepper cannot answer.
  // -------------------------------------------------------------------------
  const { isTablet } = useLayout()
  // Measured, not derived: #446 learned that the formula and the real column
  // stop agreeing the moment either end moves — an inset, a cap, a padding.
  const [paneWidth, setPaneWidth] = useState<number | null>(null)
  const [dayOffset, setDayOffset] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ player: Player; team: Team; game: Game; day: MatrixDay } | null>(null)

  const dayCount = visibleMatchDayCount(paneWidth ?? 0)
  const maxOffset = Math.max(0, matchDayGroups.length - dayCount)
  // Opens on [précédente, courante, suivante], like the web — the active
  // journée in the middle rather than the season's first at the left.
  const smartOffset = Math.min(Math.max(0, mdIndex - 1), maxOffset)
  const offset = Math.min(dayOffset ?? smartOffset, maxOffset)
  const visibleGroups = matchDayGroups.slice(offset, offset + dayCount)
  const columns = matrixColumns(paneWidth ?? 0, dayCount)

  /** This team's fixture for a journée — absent when it sits the round out. */
  const teamGame = (team: Team, mds: MatchDay[]): { matchDay?: MatchDay; game?: Game } => {
    for (const md of mds) {
      const game = games.find(
        (g) => g.matchDayId === md.id && (g.homeTeamId === team.id || g.awayTeamId === team.id),
      )
      if (game) return { matchDay: md, game }
    }
    return { matchDay: mds.find((m) => m.groupId === team.groupId) }
  }

  /** Every fixture this team has in the phase — the denominator of the counts. */
  const teamGames = (team: Team): Game[] => {
    const ids = new Set(
      matchDayGroups.flatMap((g) => g.matchDays).filter((m) => m.groupId === team.groupId).map((m) => m.id),
    )
    return games.filter(
      (g) => ids.has(g.matchDayId) && (g.homeTeamId === team.id || g.awayTeamId === team.id),
    )
  }

  function matrixDays(team: Team): MatrixDay[] {
    return visibleGroups.map((group) => {
      const { matchDay, game } = teamGame(team, group.matchDays)
      const homeTeam = game ? teams.find((t) => t.id === game.homeTeamId) : undefined
      const isHome = !!game && game.homeTeamId === team.id
      const opp = game ? teams.find((t) => t.id === (isHome ? game.awayTeamId : game.homeTeamId)) : undefined
      const time = game && matchDay ? gameTime(game, matchDay, homeTeam) : ''
      const confirmed = !!game && !!matchDay && isSlotConfirmed(game, matchDay, homeTeam)
      const date = game && matchDay ? gameDate(game, matchDay) : matchDay?.date
      return {
        number: group.number,
        matchDay,
        game,
        dateLabel: confirmed && date
          ? `${shortDate(date)}${time ? ` · ${time}` : ''}`
          : formatMatchDayRange(group.startDate, group.endDate),
        unconfirmed: !!game && !confirmed,
        isHome,
        opponentName: opp ? getTeamName(opp, clubs) : '?',
      }
    })
  }

  function matrixRows(team: Team, days: MatrixDay[]): MatrixRow[] {
    const roster = sortByName(
      team.playerIds
        .map((pid) => players.find((p) => p.id === pid))
        .filter((p): p is Player => !!p),
    )
    const fixtures = teamGames(team)
    const clubTeamsInPhase = clubTeams
    return roster.map((player) => {
      const brulageInfo = computeBrulage(player.id, clubTeamsInPhase, matchDays, games, gameSelections)
      const burnedInto = brulageInfo.burnedIntoTeamId
        ? teams.find((t) => t.id === brulageInfo.burnedIntoTeamId)
        : undefined
      return {
        player,
        isCaptain: team.captainId === player.id,
        points: pointsFor(playerPhasePoints, team.phaseId, player.id) || undefined,
        availableCount: fixtures.filter(
          (g) => availabilityOf(player.id, g.id) === 'available',
        ).length,
        playedCount: fixtures.filter((g) => selectionOf(team.id, g.id).includes(player.id)).length,
        totalGames: fixtures.length,
        brulage: burnedInto ? { teamNumber: burnedInto.number, color: burnedInto.color } : undefined,
        cells: days.map((day, i) => ({
          status: day.game ? availabilityOf(player.id, day.game.id) : undefined,
          canEdit: !!user && canEditAvailability(user, team, player.id),
          selectedTeam: selectedTeamFor(player.id, i),
        })),
      }
    })
  }

  const availabilityOf = (playerId: string, gameId: string): AvailabilityStatus | undefined =>
    gameAvailabilities.find((a) => a.playerId === playerId && a.gameId === gameId)?.status

  const selectionOf = (teamId: string, gameId: string): string[] =>
    gameSelections.find((sel) => sel.teamId === teamId && sel.gameId === gameId)?.playerIds ?? []

  /**
   * Which of the club's teams fielded this player that journée, if any — the
   * whole round, not this team's fixture: a player lent to another team is
   * exactly what the column is there to show.
   */
  function selectedTeamFor(playerId: string, groupIndex: number) {
    const group = visibleGroups[groupIndex]
    if (!group) return undefined
    for (const t of clubTeams) {
      const { game } = teamGame(t, group.matchDays)
      if (game && selectionOf(t.id, game.id).includes(playerId)) {
        return { number: t.number, color: t.color }
      }
    }
    return undefined
  }

  async function answer(status: AvailabilityStatus | null) {
    if (!editing || !user) return
    const { player, team, game } = editing
    setEditing(null)
    if (status === null) await clearAvailability(player.id, game.id)
    else await setAvailability(player.id, game.id, status, availabilityOverride(user, team, player.id))
  }

  function renderCard({ team, game }: { team: Team; game: Game }) {
    const md = matchDays.find((m) => m.id === game.matchDayId)
    if (!md) return null
    const isHome = game.homeTeamId === team.id
    const oppId = isHome ? game.awayTeamId : game.homeTeamId
    const opp = teams.find((t) => t.id === oppId)
    const isMine = mineLabel.has(team.id)
    const selectedCount = gameSelections.find((s) => s.teamId === team.id && s.gameId === game.id)?.playerIds.length ?? 0
    const availableCount = isMine
      ? team.playerIds.filter((pid) => gameAvailabilities.find((a) => a.playerId === pid && a.gameId === game.id)?.status === 'available').length
      : null
    return (
      <MatchCard
        key={game.id}
        team={team}
        teamName={getTeamName(team, clubs)}
        label={mineLabel.get(team.id)}
        mine={isMine}
        divisionLabel={divLabel(team)}
        playersPerGame={perGame(team)}
        matchDayNumber={md.number}
        matchDayDate={gameDate(game, md)}
        time={gameTime(game, md, teams.find((t) => t.id === game.homeTeamId)) || undefined}
        confirmed={isSlotConfirmed(game, md, teams.find((t) => t.id === game.homeTeamId))}
        opponentName={opp ? getTeamName(opp, clubs) : '?'}
        isHome={isHome}
        selectedCount={selectedCount}
        availableCount={availableCount}
        onPress={() => router.push({ pathname: '/match/[id]', params: { id: game.id, teamId: team.id } })}
      />
    )
  }

  const phaseSwitcher = phase ? (
    <Switcher
      title={`Saison ${phase.displayName}`}
      onPrev={phaseIndex > 0 ? () => selectPhase(phaseIndex - 1) : undefined}
      onNext={phaseIndex < orderedPhases.length - 1 ? () => selectPhase(phaseIndex + 1) : undefined}
    />
  ) : null

  const sheet = editing && (
    <AvailabilitySheet
      title={`${editing.player.firstName} ${editing.player.lastName}`}
      subtitle={`J${editing.day.number} · ${editing.day.dateLabel}`}
      value={availabilityOf(editing.player.id, editing.game.id)}
      onPick={(status) => answer(status)}
      onClear={() => answer(null)}
      onClose={() => setEditing(null)}
    />
  )

  // ---- La matrice (#468) --------------------------------------------------
  if (isTablet) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={styles.matrix}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {/* The grid measures this, so its width is the one the screen really
              gives it — rail, insets and padding already taken out. */}
          <View
            testID="matrix-column"
            style={styles.matrixColumn}
            onLayout={(e) => setPaneWidth(e.nativeEvent.layout.width)}
          >
            {phaseSwitcher}

            {matchDayGroups.length === 0 && (
              <Text style={styles.empty}>Aucune journée pour cette phase.</Text>
            )}
            {matchDayGroups.length > 0 && clubTeams.length === 0 && (
              <Text style={styles.empty}>Aucune équipe pour cette phase.</Text>
            )}

            {paneWidth !== null &&
              clubTeams
                .slice()
                .sort((a, b) => a.number - b.number)
                .map((team) => {
                  const days = matrixDays(team)
                  return (
                    <MatchDayMatrix
                      key={team.id}
                      team={team}
                      teamName={getTeamName(team, clubs)}
                      divisionLabel={divLabel(team)}
                      days={days}
                      rows={matrixRows(team, days)}
                      columns={columns}
                      pager={
                        matchDayGroups.length > dayCount
                          ? {
                              label: `${offset + 1}–${Math.min(offset + dayCount, matchDayGroups.length)} / ${matchDayGroups.length}`,
                              onPrev: offset > 0 ? () => setDayOffset(offset - 1) : undefined,
                              onNext: offset < maxOffset ? () => setDayOffset(offset + 1) : undefined,
                            }
                          : undefined
                      }
                      onEditAvailability={(playerId, game, dayIndex) => {
                        const player = players.find((p) => p.id === playerId)
                        const day = days[dayIndex]
                        if (player && day) setEditing({ player, team, game, day })
                      }}
                      onOpenGame={(game) =>
                        router.push({ pathname: '/match/[id]', params: { id: game.id, teamId: team.id } })
                      }
                    />
                  )
                })}
          </View>
        </ScrollView>
        {sheet}
      </Screen>
    )
  }

  // ---- Un téléphone : une journée, en cartes ------------------------------
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.scroll, contentWidth()]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {phaseSwitcher}

        {mdGroup ? (
          <Switcher
            large
            title={`Journée ${mdGroup.number}`}
            subtitle={formatMatchDayRange(mdGroup.startDate, mdGroup.endDate)}
            onPrev={mdIndex > 0 ? () => setMdNumber(matchDayGroups[mdIndex - 1].number) : undefined}
            onNext={mdIndex < matchDayGroups.length - 1 ? () => setMdNumber(matchDayGroups[mdIndex + 1].number) : undefined}
          />
        ) : (
          <Text style={styles.empty}>Aucune journée pour cette phase.</Text>
        )}

        {mdGroup && clubGames.length === 0 && (
          <Text style={styles.empty}>Aucun match cette journée.</Text>
        )}

        {mine.map(renderCard)}
        {others.map(renderCard)}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },
  // Accueil's margins, so the grid sits on the same rails as the rest of the
  // app — and no reading cap: the grid is the width, that is its whole point.
  matrix: { padding: 16 },
  matrixColumn: { gap: 16 },
  empty: { fontSize: 14, color: colors.textSecondary },
})
