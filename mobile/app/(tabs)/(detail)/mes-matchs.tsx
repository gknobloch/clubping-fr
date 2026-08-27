import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { getTeamName } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { Screen, contentWidth } from '@/components/Screen'
import { Switcher } from '@/components/Switcher'
import { MatchHeader } from '@/components/MatchHeader'
import { gameDate, gameTime, isSlotConfirmed } from '@/utils/matchdays'
import type { Game, MatchDay, Team } from '@shared/types'

// ---------------------------------------------------------------------------
// Player match list — the games a player was selected for in a phase, aligned
// with the Équipes / Journées screens: a < > phase switcher, then the regular
// match cards (MatchHeader, no availability). Each card opens the match detail.
// Games played for a team other than the player's rostered one are tagged
// "Renfort".
//
// Defaults to the logged-in player (Accueil → "Tous mes matchs"); pass a
// `playerId` param to show any player's matches (Joueur detail → "Matchs").
// ---------------------------------------------------------------------------
export default function MesMatchsScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { playerId } = useLocalSearchParams<{ playerId?: string }>()
  const { user } = useAuth()
  const {
    clubs, teams, players, matchDays, games, phases, divisions, gameSelections, refreshing, refresh,
  } = useAppData()

  // The player whose matches we show — the param, else the logged-in player.
  const targetPlayerId = playerId ?? (user?.isPlayer ? user.id : undefined)
  const targetPlayer = useMemo(
    () => players.find((p) => p.id === targetPlayerId),
    [players, targetPlayerId],
  )
  const targetClubId = targetPlayer?.clubId
  const mdMap = useMemo(() => new Map(matchDays.map((md) => [md.id, md])), [matchDays])
  const divMap = useMemo(() => new Map(divisions.map((d) => [d.id, d])), [divisions])

  // Title: "Mes matchs" for the current user, the player's name otherwise.
  useEffect(() => {
    const isSelf = targetPlayerId === user?.id
    navigation.setOptions({
      title: isSelf
        ? 'Mes matchs'
        : targetPlayer
          ? `${targetPlayer.firstName} ${targetPlayer.lastName}`
          : 'Matchs',
    })
  }, [navigation, targetPlayerId, targetPlayer, user?.id])

  // The team the player is rostered on, per phase.
  const teamByPhase = useMemo(() => {
    const map = new Map<string, Team>()
    if (targetPlayerId) {
      for (const t of teams) if (t.playerIds.includes(targetPlayerId)) map.set(t.phaseId, t)
    }
    return map
  }, [teams, targetPlayerId])

  // Phases the player took part in (rostered or fielded as a renfort).
  const participated = useMemo(() => {
    const s = new Set<string>()
    for (const phaseId of teamByPhase.keys()) s.add(phaseId)
    if (targetPlayerId) {
      for (const sel of gameSelections) {
        if (!sel.playerIds.includes(targetPlayerId)) continue
        const t = teams.find((x) => x.id === sel.teamId)
        if (t) s.add(t.phaseId)
      }
    }
    return s
  }, [teamByPhase, gameSelections, teams, targetPlayerId])

  // Phases for the < > switcher (chronological by name); default active.
  const orderedPhases = useMemo(
    () =>
      phases
        .filter((p) => participated.has(p.id))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [phases, participated],
  )
  const activePhase = phases.find((p) => p.status === 'active')
  const fallbackPhase =
    activePhase && participated.has(activePhase.id)
      ? activePhase
      : orderedPhases[orderedPhases.length - 1]
  const [phaseId, setPhaseId] = useState<string | undefined>(undefined)
  const phase = phases.find((p) => p.id === phaseId) ?? fallbackPhase
  const phaseIndex = orderedPhases.findIndex((p) => p.id === phase?.id)

  function selectPhase(i: number) {
    const p = orderedPhases[i]
    if (p) setPhaseId(p.id)
  }

  // The player's games for the selected phase: only the games they were
  // selected for, across any team of their club. A game for a team other than
  // the one they're rostered on is flagged as a renfort.
  const playerGames = useMemo(() => {
    if (!phase || !targetPlayerId) return [] as { game: Game; team: Team; md: MatchDay; isRenfort: boolean }[]
    const assigned = teamByPhase.get(phase.id)
    const phaseTeams = teams.filter(
      (t) => t.phaseId === phase.id && (targetClubId ? t.clubId === targetClubId : t.id === assigned?.id),
    )
    const out: { game: Game; team: Team; md: MatchDay; isRenfort: boolean }[] = []
    const seen = new Set<string>()
    for (const t of phaseTeams) {
      const isAssigned = assigned ? t.id === assigned.id : false
      for (const g of games) {
        if (g.homeTeamId !== t.id && g.awayTeamId !== t.id) continue
        const sel = gameSelections.find((s) => s.teamId === t.id && s.gameId === g.id)
        if (!sel?.playerIds.includes(targetPlayerId)) continue
        const md = mdMap.get(g.matchDayId)
        if (!md || seen.has(g.id)) continue
        seen.add(g.id)
        out.push({ game: g, team: t, md, isRenfort: !isAssigned })
      }
    }
    return out.sort((a, b) => gameDate(a.game, a.md).localeCompare(gameDate(b.game, b.md)))
  }, [phase, targetPlayerId, targetClubId, teamByPhase, teams, games, gameSelections, mdMap])

  function opponentName(game: Game, team: Team): string {
    const oppId = game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId
    const opp = teams.find((t) => t.id === oppId)
    return opp ? getTeamName(opp, clubs) : '—'
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.scroll, contentWidth()]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {!targetPlayerId || orderedPhases.length === 0 ? (
          <Text style={styles.empty}>Aucun match à afficher.</Text>
        ) : (
          <>
            {phase ? (
              <Switcher
                title={`Saison ${phase.displayName}`}
                onPrev={phaseIndex > 0 ? () => selectPhase(phaseIndex - 1) : undefined}
                onNext={
                  phaseIndex < orderedPhases.length - 1 ? () => selectPhase(phaseIndex + 1) : undefined
                }
              />
            ) : null}

            {playerGames.length === 0 ? (
              <Text style={styles.empty}>Aucun match pour cette phase.</Text>
            ) : (
              playerGames.map(({ game, team, md, isRenfort }) => (
                <TouchableOpacity
                  key={game.id}
                  style={styles.card}
                  activeOpacity={0.7}
                  onPress={() =>
                    router.push({ pathname: '/match/[id]', params: { id: game.id, teamId: team.id } })
                  }
                >
                  <View style={styles.cardBody}>
                    <MatchHeader
                      matchDayNumber={md.number}
                      divisionLabel={divMap.get(team.divisionId)?.displayName}
                      teamColor={team.color}
                      teamNumber={team.number}
                      isHome={game.homeTeamId === team.id}
                      teamName={getTeamName(team, clubs)}
                      opponentName={opponentName(game, team)}
                      matchDayDate={gameDate(game, md)}
                      time={gameTime(game, md, teams.find((t) => t.id === game.homeTeamId)) || undefined}
                      confirmed={isSlotConfirmed(game, md, teams.find((t) => t.id === game.homeTeamId))}
                      label={isRenfort ? 'Renfort' : undefined}
                    />
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },
  empty: { fontSize: 14, color: colors.textSecondary },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  cardBody: { flex: 1, gap: 8 },
})
