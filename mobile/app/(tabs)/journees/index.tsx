import { useMemo, useState } from 'react'
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { getTeamName } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { getPhaseMatchDays, activeMatchDayNumber, formatDateRange, gameDate } from '@/utils/matchdays'
import { MatchHeader } from '@/components/MatchHeader'
import { Switcher } from '@/components/Switcher'
import type { Game, Team } from '@shared/types'
import { fonts } from '@/constants/typography'

// ---------------------------------------------------------------------------
// Match card — consistent with the Accueil next-match header
// ---------------------------------------------------------------------------
function MatchCard({
  team, game, teamName, label, mine, divisionLabel, playersPerGame,
  matchDayNumber, matchDayDate, opponentName, isHome, selectedCount, availableCount, onPress,
}: {
  team: Team; game: Game; teamName: string; label?: string; mine?: boolean
  divisionLabel?: string; playersPerGame: number
  matchDayNumber: number; matchDayDate: string
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
          time={game.time}
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

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function JourneesScreen() {
  const { user } = useAuth()
  const { clubs, teams, matchDays, games, phases, divisions, groups, gameAvailabilities, gameSelections, refreshing, refresh } = useAppData()
  const router = useRouter()

  const myClubId = user?.clubId
  const myPlayerId = user?.isPlayer ? user.id : undefined

  // Phases ordered for the < > switcher (chronological by name); default active.
  const orderedPhases = useMemo(
    () => [...phases].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [phases],
  )
  const activePhase = phases.find((p) => p.status === 'active')
  const [phaseId, setPhaseId] = useState<string | undefined>(activePhase?.id ?? orderedPhases[0]?.id)
  const phase = phases.find((p) => p.id === phaseId) ?? activePhase
  const phaseIndex = orderedPhases.findIndex((p) => p.id === phase?.id)

  const matchDayGroups = useMemo(
    () => (phase ? getPhaseMatchDays(phase.id, matchDays, groups, divisions) : []),
    [phase, matchDays, groups, divisions],
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
    const clubTeams = teams.filter((t) => t.clubId === myClubId && t.phaseId === phase.id)
    const result: { team: Team; game: Game }[] = []
    for (const team of clubTeams) {
      const game = games.find(
        (g) => roundMdIds.has(g.matchDayId) && (g.homeTeamId === team.id || g.awayTeamId === team.id),
      )
      if (game) result.push({ team, game })
    }
    return result.sort((a, b) => a.team.number - b.team.number)
  }, [phase, mdGroup, teams, games, myClubId])

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
        game={game}
        teamName={getTeamName(team, clubs)}
        label={mineLabel.get(team.id)}
        mine={isMine}
        divisionLabel={divLabel(team)}
        playersPerGame={perGame(team)}
        matchDayNumber={md.number}
        matchDayDate={gameDate(game, md)}
        opponentName={opp ? getTeamName(opp, clubs) : '?'}
        isHome={isHome}
        selectedCount={selectedCount}
        availableCount={availableCount}
        onPress={() => router.push({ pathname: '/match/[id]', params: { id: game.id, teamId: team.id } })}
      />
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {phase ? (
          <Switcher
            title={`Saison ${phase.displayName}`}
            onPrev={phaseIndex > 0 ? () => selectPhase(phaseIndex - 1) : undefined}
            onNext={phaseIndex < orderedPhases.length - 1 ? () => selectPhase(phaseIndex + 1) : undefined}
          />
        ) : null}

        {mdGroup ? (
          <Switcher
            large
            title={`Journée ${mdGroup.number}`}
            subtitle={formatDateRange(mdGroup.startDate, mdGroup.endDate)}
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 12 },
  empty: { fontSize: 14, color: colors.textSecondary },
})
