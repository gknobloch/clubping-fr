import {
  ScrollView, View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { useAppData } from '@/contexts/DataContext'
import { getTeamName } from '@/utils/roles'
import { sortByName } from '@shared/lib/sortByName'
import { computeBrulage } from '@shared/lib/brulage'
import { teamPhaseEntries } from '@shared/lib/teamPhases'
import { gameDate } from '@/utils/matchdays'
import { colors } from '@/constants/colors'
import { Switcher } from '@/components/Switcher'
import { MatchHeader } from '@/components/MatchHeader'
import { PlayerSheet } from '@/components/PlayerSheet'
import type { PlayerHistoryEntry } from '@/components/PlayerSheet'
import type { Player } from '@shared/types'

// ---------------------------------------------------------------------------
// A team's full phase view: roster (with play-counts) + every match of the
// phase. A < > switcher pages through the phases this team (club + number) has
// played, in place — aligned with the Équipes / Mes matchs screens. The nav
// title shows the team name; a footer row links to the team's own page so the
// screen is never a dead-end when reached from a match.
// ---------------------------------------------------------------------------
export default function PhaseGamesScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>()
  const { teams, players, clubs, phases, divisions, matchDays, games, gameSelections } = useAppData()
  const navigation = useNavigation()
  const router = useRouter()

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [phaseId, setPhaseId] = useState<string | undefined>(undefined)

  // The tapped team identifies the logical team (club + number); its name and
  // games are stable across phases.
  const baseTeam = teams.find((t) => t.id === teamId)

  useEffect(() => {
    if (baseTeam) navigation.setOptions({ title: getTeamName(baseTeam, clubs) })
  }, [baseTeam, clubs, navigation])

  // Include the current phase even before its schedule is published, so a
  // team detail opened for that phase does not fall back to an older season.
  const entries = useMemo(
    () => (
      baseTeam
        ? teamPhaseEntries(baseTeam, teams, phases, matchDays, games, { includeEmpty: true })
        : []
    ),
    [baseTeam, teams, phases, matchDays, games],
  )
  const ordered = useMemo(
    () => [...entries].sort((a, b) => a.label.localeCompare(b.label)),
    [entries],
  )

  // Default: the tapped team's own phase, else the active one, else most recent.
  const fallbackPhaseId =
    entries.find((e) => e.phaseId === baseTeam?.phaseId)?.phaseId ??
    entries.find((e) => e.isActive)?.phaseId ??
    ordered[ordered.length - 1]?.phaseId

  const currentEntry =
    ordered.find((e) => e.phaseId === (phaseId ?? fallbackPhaseId)) ?? ordered[ordered.length - 1]
  const phaseIndex = ordered.findIndex((e) => e.phaseId === currentEntry?.phaseId)

  function selectPhase(i: number) {
    const e = ordered[i]
    if (e) setPhaseId(e.phaseId)
  }

  // The team record for the selected phase — everything below keys off it.
  const team = teams.find((t) => t.id === currentEntry?.teamId)
  const teamGames = currentEntry?.games ?? []

  const teamSelections = useMemo(
    () => (team ? gameSelections.filter((s) => s.teamId === team.id) : []),
    [gameSelections, team],
  )

  const { rosterPlayers, borrowedPlayers, playedCount } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const sel of teamSelections) {
      for (const pid of sel.playerIds) {
        counts.set(pid, (counts.get(pid) ?? 0) + 1)
      }
    }
    const rosterIds = new Set(team?.playerIds ?? [])
    const borrowedIds = [...counts.keys()].filter((pid) => !rosterIds.has(pid))
    const roster = sortByName(
      (team?.playerIds ?? [])
        .map((pid) => players.find((p) => p.id === pid))
        .filter(Boolean) as Player[],
    )
    const borrowed = sortByName(
      borrowedIds.map((pid) => players.find((p) => p.id === pid)).filter(Boolean) as Player[],
    )
    return { rosterPlayers: roster, borrowedPlayers: borrowed, playedCount: counts }
  }, [team, teamSelections, players])

  // Club teams in the same phase (for brûlage computation)
  const clubTeamsInPhase = useMemo(
    () => team ? teams.filter((t) => t.clubId === team.clubId && t.phaseId === team.phaseId) : [],
    [team, teams],
  )

  // Per-player history across ALL club teams in the phase (not just current team)
  const playerHistory = useMemo(() => {
    if (!selectedPlayer) return []
    const todayStr = new Date().toISOString().slice(0, 10)
    const rows: Array<{
      rawDate: string; jNumber?: number; isHome: boolean
      oppName: string; team: typeof clubTeamsInPhase[0]; date: string; isPast: boolean
    }> = []
    for (const t of clubTeamsInPhase) {
      const mdInGroup = new Set(
        matchDays.filter((md) => md.groupId === t.groupId).map((md) => md.id),
      )
      for (const g of games) {
        if ((g.homeTeamId !== t.id && g.awayTeamId !== t.id) || !mdInGroup.has(g.matchDayId)) continue
        const sel = gameSelections.find((s) => s.teamId === t.id && s.gameId === g.id)
        if (!sel?.playerIds.includes(selectedPlayer.id)) continue
        const md = matchDays.find((day) => day.id === g.matchDayId)
        if (!md) continue
        const isHome = g.homeTeamId === t.id
        const oppTeam = teams.find((ot) => ot.id === (isHome ? g.awayTeamId : g.homeTeamId))
        const gDate = gameDate(g, md)
        rows.push({
          rawDate: gDate,
          jNumber: md.number,
          isHome,
          oppName: oppTeam ? getTeamName(oppTeam, clubs) : '—',
          team: t,
          date: new Date(gDate + 'T12:00:00').toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'short',
          }),
          isPast: gDate < todayStr,
        })
      }
    }
    return rows.sort((a, b) => a.rawDate.localeCompare(b.rawDate))
  }, [selectedPlayer, clubTeamsInPhase, matchDays, games, gameSelections, teams, clubs])

  const brulageInfo = useMemo(() => {
    if (!selectedPlayer || !team) return null
    const info = computeBrulage(selectedPlayer.id, clubTeamsInPhase, matchDays, games, gameSelections)
    if (!info.burnedIntoTeamId) return null
    return teams.find((t) => t.id === info.burnedIntoTeamId) ?? null
  }, [selectedPlayer, team, clubTeamsInPhase, matchDays, games, gameSelections, teams])

  const totalGames = teamGames.length
  const today = new Date().toISOString().slice(0, 10)

  if (!baseTeam) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.empty}>Équipe introuvable.</Text>
      </SafeAreaView>
    )
  }

  function openProfile(player: Player) {
    setSelectedPlayer(null)
    router.push({ pathname: '/player/[id]', params: { id: player.id } })
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Phase switcher — aligned with Équipes / Mes matchs */}
        {currentEntry && (
          <Switcher
            title={currentEntry.label}
            onPrev={phaseIndex > 0 ? () => selectPhase(phaseIndex - 1) : undefined}
            onNext={phaseIndex < ordered.length - 1 ? () => selectPhase(phaseIndex + 1) : undefined}
          />
        )}

        {/* Member stats */}
        {(rosterPlayers.length > 0 || borrowedPlayers.length > 0) && team && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Joueurs ({rosterPlayers.length + borrowedPlayers.length})
            </Text>
            {rosterPlayers.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.memberRow}
                onPress={() => setSelectedPlayer(p)}
              >
                <Text style={styles.memberName}>{p.firstName} {p.lastName}</Text>
                {p.id === team.captainId && <Text style={styles.capBadge}>Cap.</Text>}
                <Text style={styles.gamesCount}>{playedCount.get(p.id) ?? 0}/{totalGames}</Text>
              </TouchableOpacity>
            ))}
            {borrowedPlayers.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.memberRow}
                onPress={() => setSelectedPlayer(p)}
              >
                <Text style={styles.memberName}>{p.firstName} {p.lastName}</Text>
                <Text style={styles.renforceBadge}>Renfort</Text>
                <Text style={styles.gamesCount}>{playedCount.get(p.id) ?? 0}/{totalGames}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Not a dead-end: jump to the team's own page (for the selected phase). */}
        {team && (
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push({ pathname: '/team/[id]', params: { id: team.id } })}
          >
            <View style={styles.linkLeft}>
              <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.linkText}>Voir la fiche équipe</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {/* Games list — tappable cards aligned with Journées / Mes matchs. */}
        <Text style={styles.listLabel}>Matchs ({totalGames})</Text>
        {teamGames.map((g) => {
          const md = g.matchDay
          if (!md || !team) return null
          const isHome = g.homeTeamId === team.id
          const oppTeam = teams.find((t) => t.id === (isHome ? g.awayTeamId : g.homeTeamId))
          const oppName = oppTeam ? getTeamName(oppTeam, clubs) : '—'

          const sel = teamSelections.find((s) => s.gameId === g.id)
          const gamePlayers = (sel?.playerIds ?? [])
            .map((pid) => players.find((p) => p.id === pid))
            .filter(Boolean) as Player[]

          return (
            <TouchableOpacity
              key={g.id}
              style={styles.matchCard}
              activeOpacity={0.7}
              onPress={() =>
                router.push({ pathname: '/match/[id]', params: { id: g.id, teamId: team.id } })
              }
            >
              <View style={styles.matchCardBody}>
                <MatchHeader
                  matchDayNumber={md.number}
                  divisionLabel={divisions.find((d) => d.id === team.divisionId)?.displayName}
                  teamColor={team.color}
                  teamNumber={team.number}
                  isHome={isHome}
                  teamName={getTeamName(team, clubs)}
                  opponentName={oppName}
                  matchDayDate={gameDate(g, md)}
                  time={g.time}
                />
                {gamePlayers.length > 0 && (
                  <View style={styles.gamePlayers}>
                    {gamePlayers.map((p) => (
                      <Text key={p.id} style={styles.gamePlayer}>{p.firstName} {p.lastName}</Text>
                    ))}
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )
        })}
        {totalGames === 0 && <Text style={styles.empty}>Aucun match trouvé.</Text>}

      </ScrollView>

      {selectedPlayer && team && (
        <PlayerSheet
          player={selectedPlayer}
          phaseLabel={currentEntry?.label}
          phasePoints={team.rosterInitialPoints?.[selectedPlayer.id]}
          gamesPlayed={playerHistory.filter((e) => e.isPast).length}
          gamesTotal={games.filter((g) => {
            if (g.homeTeamId !== team.id && g.awayTeamId !== team.id) return false
            const md = matchDays.find((m) => m.id === g.matchDayId)
            return !!md && gameDate(g, md) < today
          }).length}
          team={team}
          brulageTeam={brulageInfo}
          history={playerHistory.map(
            (e): PlayerHistoryEntry => ({
              jNumber: e.jNumber,
              icon: e.isHome ? 'home' : 'paper-plane-outline',
              text: e.oppName,
              team: e.team,
              date: e.date,
              isPast: e.isPast,
            }),
          )}
          onClose={() => setSelectedPlayer(null)}
          onProfile={() => openProfile(selectedPlayer)}
        />
      )}
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { gap: 12, padding: 16, paddingBottom: 32 },
  empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', padding: 24 },

  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  memberName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  capBadge: {
    fontSize: 11, fontWeight: '600', color: colors.accent,
    backgroundColor: colors.accentSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  renforceBadge: {
    fontSize: 11, fontWeight: '500', color: colors.textSecondary,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  gamesCount: {
    fontSize: 13, fontWeight: '600', color: colors.textSecondary,
    minWidth: 36, textAlign: 'right',
  },

  // Standalone label above the match-card list (parallels the Joueurs title).
  listLabel: {
    fontSize: 12, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 4, marginTop: 4,
  },

  // Tappable match card — mirrors the Mes matchs / Journées card.
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  matchCardBody: { flex: 1, gap: 8 },

  gamePlayers: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  gamePlayer: {
    fontSize: 12, color: colors.textSecondary,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden',
  },

  // Footer link to the team's own page — mirrors the match-detail row style.
  linkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
  },
  linkLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
})
