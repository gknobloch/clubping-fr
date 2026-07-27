import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { canManageTeam, getTeamName } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { PlayerIdentityCard } from '@/components/PlayerIdentityCard'
import { NextMatchCard } from '@/components/NextMatchCard'
import { CaptainSelectionSheet } from '@/components/CaptainSelectionSheet'
import { sortByName } from '@shared/lib/sortByName'
import { gameDate } from '@/utils/matchdays'
import { getMondayOf, todayIso } from '@/utils/weeks'
import type { AvailabilityStatus, Game, MatchDay, Player, Team } from '@shared/types'

// ---------------------------------------------------------------------------
// Home screen — player dashboard
// ---------------------------------------------------------------------------
export default function HomeScreen() {
  const router = useRouter()
  const { user, displayName } = useAuth()
  const {
    clubs, seasons, teams, players, matchDays, games,
    phases, divisions, groups,
    gameAvailabilities, gameSelections,
    setAvailability, clearAvailability, setGameSelection,
    refreshing, refresh,
  } = useAppData()

  const { width } = useWindowDimensions()
  const cardWidth = width - 32 // matches the scroll container's 16px padding

  const [composeGameId, setComposeGameId] = useState<string | null>(null)
  const [matchPage, setMatchPage] = useState(0)

  const today = todayIso()
  const currentWeekMonday = getMondayOf(today)

  const myPlayerId = user?.isPlayer ? user.id : undefined

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const mdMap = useMemo(() => new Map(matchDays.map((md) => [md.id, md])), [matchDays])
  const divMap = useMemo(() => new Map(divisions.map((d) => [d.id, d])), [divisions])
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  // Venue for a game = the home team's game-location address ("Label, City"),
  // falling back to the home club's city when there's no address.
  const venueFor = (homeTeam: Team | undefined): string | undefined => {
    if (!homeTeam) return undefined
    const addr = clubs.flatMap((c) => c.addresses ?? []).find((a) => a.id === homeTeam.gameLocationId)
    if (addr) return addr.label ? `${addr.label}, ${addr.city}` : addr.city
    const homeClub = clubs.find((c) => c.id === homeTeam.clubId)
    const cityAddr = homeClub?.addresses?.find((a) => a.isDefault) ?? homeClub?.addresses?.[0]
    return cityAddr?.city
  }

  const myTeamByPhase = useMemo(() => {
    if (!myPlayerId) return new Map<string, Team>()
    const map = new Map<string, Team>()
    for (const t of teams) {
      if (t.playerIds.includes(myPlayerId)) map.set(t.phaseId, t)
    }
    return map
  }, [teams, myPlayerId])

  const activeSeason = seasons.find((s) => s.status === 'active')
  const activePhase = phases.find((p) => p.status === 'active')
  const myActiveTeam = activePhase ? myTeamByPhase.get(activePhase.id) : undefined
  const isCaptain = !!(user && myActiveTeam && canManageTeam(user, myActiveTeam))
  const isPlayer = !!myPlayerId && !!myActiveTeam

  function getTeamGames(teamId: string) {
    return games.filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId)
  }
  function getOpponentName(oppTeamId: string): string {
    const opp = teams.find((t) => t.id === oppTeamId)
    return opp ? getTeamName(opp, clubs) : '?'
  }
  function getDivisionLabel(team: Team): string | undefined {
    const grp = groupMap.get(team.groupId)
    return grp ? divMap.get(grp.divisionId)?.displayName : undefined
  }
  function getPlayersPerGame(team: Team): number {
    const grp = groupMap.get(team.groupId)
    return (grp ? divMap.get(grp.divisionId)?.playersPerGame : undefined) ?? 4
  }
  function getAvailability(playerId: string, gameId: string): AvailabilityStatus | undefined {
    return gameAvailabilities.find((a) => a.playerId === playerId && a.gameId === gameId)?.status
  }
  function getSelectedForGame(teamId: string, gameId: string): string[] {
    return gameSelections.find((s) => s.teamId === teamId && s.gameId === gameId)?.playerIds ?? []
  }

  const activeTeamGames = myActiveTeam ? getTeamGames(myActiveTeam.id) : []
  const upcomingGames = useMemo(() => {
    if (!myActiveTeam) return []
    const dateOf = (g: Game) => { const md = mdMap.get(g.matchDayId); return md ? gameDate(g, md) : null }
    return getTeamGames(myActiveTeam.id)
      .filter((g) => { const d = dateOf(g); return d !== null && getMondayOf(d) >= currentWeekMonday })
      .sort((a, b) => (dateOf(a) ?? '').localeCompare(dateOf(b) ?? ''))
  }, [myActiveTeam, games, mdMap, currentWeekMonday]) // eslint-disable-line react-hooks/exhaustive-deps

  // Roster sorted (used by every hero card + the compose sheet).
  const roster = useMemo(
    () => myActiveTeam
      ? sortByName(myActiveTeam.playerIds.map((id) => playerMap.get(id)).filter(Boolean) as Player[])
      : [],
    [myActiveTeam, playerMap],
  )

  const activeClubTeams = useMemo(() => {
    if (!myActiveTeam || !activePhase) return []
    return teams.filter((t) => t.clubId === myActiveTeam.clubId && t.phaseId === activePhase.id)
  }, [teams, myActiveTeam, activePhase])

  const allClubPlayers = useMemo(() => {
    if (!myActiveTeam) return []
    return players.filter((p) => p.clubId === myActiveTeam.clubId)
  }, [players, myActiveTeam])

  // Metric tiles — "joués" is out of games already played (past), not the
  // whole season, so an upcoming game isn't counted in the denominator.
  const pastTeamGames = activeTeamGames.filter((g) => {
    const md = mdMap.get(g.matchDayId)
    return md && gameDate(g, md) < today
  })
  const playedCount = myActiveTeam && myPlayerId
    ? pastTeamGames.filter((g) => getSelectedForGame(myActiveTeam.id, g.id).includes(myPlayerId)).length
    : 0
  const playedTotal = pastTeamGames.length
  const toConfirm = myPlayerId
    ? upcomingGames.filter((g) => getAvailability(myPlayerId, g.id) === undefined).length
    : 0

  // Logged-in player's record + club (welcome header)
  const me = myPlayerId ? playerMap.get(myPlayerId) : undefined
  const myClubId = me?.clubId ?? user?.clubId
  const myClub = myClubId ? clubs.find((c) => c.id === myClubId) : undefined

  // ── Hero view-models (one per upcoming game, for the carousel) ──
  type Hero = {
    game: Game; md: MatchDay; isHome: boolean; oppId: string; venueLabel?: string
    availablePlayers: Player[]; availableCount: number; noResponseCount: number; selectedCount: number
  }
  const heroes: Hero[] = myActiveTeam
    ? (upcomingGames
        .map((game): Hero | null => {
          const md = mdMap.get(game.matchDayId)
          if (!md) return null
          const isHome = game.homeTeamId === myActiveTeam.id
          const homeTeam = teams.find((t) => t.id === game.homeTeamId)
          const rosterAvail = roster.map((p) => getAvailability(p.id, game.id))
          const availablePlayers = roster.filter((_, i) => rosterAvail[i] === 'available')
          return {
            game, md, isHome,
            oppId: isHome ? game.awayTeamId : game.homeTeamId,
            venueLabel: venueFor(homeTeam),
            availablePlayers,
            availableCount: availablePlayers.length,
            noResponseCount: rosterAvail.filter((s) => s === undefined).length,
            selectedCount: getSelectedForGame(myActiveTeam.id, game.id).length,
          }
        })
        .filter(Boolean) as Hero[])
    : []

  const composeGame = upcomingGames.find((g) => g.id === composeGameId)

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {/* Identity header — shared with the player detail screen */}
        <PlayerIdentityCard
          style={styles.welcomeCard}
          playerId={me?.id ?? user?.id ?? ''}
          avatarUpdatedAt={me?.avatarUpdatedAt}
          firstName={me?.firstName ?? user?.firstName}
          lastName={me?.lastName ?? user?.lastName}
          name={displayName}
          club={myClub}
        />

        {/* ── Player dashboard ── */}
        {isPlayer && myActiveTeam && (
          <>
            <Text style={styles.sectionLabel}>
              {heroes.length > 1 ? 'Prochains matchs' : 'Prochain match'}
            </Text>
            {heroes.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.empty}>Pas de prochain match prévu.</Text>
              </View>
            ) : (
              <>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEnabled={heroes.length > 1}
                  onMomentumScrollEnd={(e) =>
                    setMatchPage(Math.round(e.nativeEvent.contentOffset.x / cardWidth))
                  }
                >
                  {heroes.map((h) => (
                    <View key={h.game.id} style={{ width: cardWidth }}>
                      <NextMatchCard
                        matchDayNumber={h.md.number}
                        matchDayDate={gameDate(h.game, h.md)}
                        time={h.game.time}
                        divisionLabel={getDivisionLabel(myActiveTeam)}
                        teamColor={myActiveTeam.color}
                        teamNumber={myActiveTeam.number}
                        isHome={h.isHome}
                        teamName={getTeamName(myActiveTeam, clubs)}
                        opponentName={getOpponentName(h.oppId)}
                        venueLabel={h.venueLabel}
                        myAvailability={myPlayerId ? getAvailability(myPlayerId, h.game.id) : undefined}
                        canSetAvailability={!!myPlayerId}
                        onPickAvailability={(status) => myPlayerId && setAvailability(myPlayerId, h.game.id, status)}
                        onClearAvailability={() => myPlayerId && clearAvailability(myPlayerId, h.game.id)}
                        availableCount={h.availableCount}
                        noResponseCount={h.noResponseCount}
                        availablePlayers={h.availablePlayers}
                        playersPerGame={getPlayersPerGame(myActiveTeam)}
                        selectedCount={h.selectedCount}
                        isCaptain={isCaptain}
                        onCompose={() => setComposeGameId(h.game.id)}
                        onOpenDetail={() => router.push({ pathname: '/match/[id]', params: { id: h.game.id, teamId: myActiveTeam.id } })}
                      />
                    </View>
                  ))}
                </ScrollView>
                {heroes.length > 1 && (
                  <View style={styles.dots}>
                    {heroes.map((h, i) => (
                      <View
                        key={h.game.id}
                        style={[styles.dot, i === Math.min(matchPage, heroes.length - 1) && styles.dotActive]}
                      />
                    ))}
                  </View>
                )}
              </>
            )}

            {/* Quick stats */}
            <View style={styles.tiles}>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>Matchs joués</Text>
                <Text style={styles.tileValue}>{playedCount} / {playedTotal}</Text>
              </View>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>À confirmer</Text>
                <Text style={[styles.tileValue, toConfirm > 0 && { color: colors.warning }]}>
                  {toConfirm} match{toConfirm !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            {/* All matches */}
            <TouchableOpacity style={styles.allMatches} onPress={() => router.push('/mes-matchs')}>
              <View style={styles.allMatchesLeft}>
                <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                <View>
                  <Text style={styles.allMatchesTitle}>Tous mes matchs</Text>
                  {activeSeason ? (
                    <Text style={styles.allMatchesSub} numberOfLines={1}>Saison {activeSeason.displayName}</Text>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </>
        )}

        {/* ── Generic view for non-players ── */}
        {!isPlayer && (
          <>
            {activeSeason && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Saison en cours</Text>
                <Text style={styles.seasonName}>{activeSeason.displayName}</Text>
              </View>
            )}
            {(() => {
              const upcomingMatchDays = matchDays
                .filter((md) => new Date(md.date) >= new Date())
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .slice(0, 3)
              if (upcomingMatchDays.length === 0) return null
              return (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Prochaines journées</Text>
                  {upcomingMatchDays.map((md) => {
                    const count = games.filter((g) => g.matchDayId === md.id).length
                    return (
                      <View key={md.id} style={styles.matchDayRow}>
                        <View>
                          <Text style={styles.matchDayName}>Journée {md.number}</Text>
                          <Text style={styles.matchDayDate}>
                            {new Date(md.date + 'T12:00:00').toLocaleDateString('fr-FR', {
                              weekday: 'long', day: 'numeric', month: 'long',
                            })}
                          </Text>
                        </View>
                        <Text style={styles.matchCount}>{count} match{count > 1 ? 's' : ''}</Text>
                      </View>
                    )
                  })}
                </View>
              )
            })()}
          </>
        )}
      </ScrollView>

      {/* Captain line-up sheet for the selected upcoming match */}
      {composeGame && myActiveTeam && (
        <CaptainSelectionSheet
          team={myActiveTeam}
          teamPlayers={roster}
          clubs={clubs}
          playersPerGame={getPlayersPerGame(myActiveTeam)}
          getAvailability={(pid) => getAvailability(pid, composeGame.id)}
          initialSelection={getSelectedForGame(myActiveTeam.id, composeGame.id)}
          selectionData={{
            matchDayId: composeGame.matchDayId,
            allClubPlayers,
            clubTeams: activeClubTeams,
            matchDays,
            games,
            gameSelections,
          }}
          onSave={(ids) => setGameSelection(myActiveTeam.id, composeGame.id, ids)}
          onClose={() => setComposeGameId(null)}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 12 },
  welcomeCard: { marginBottom: 4 },

  sectionLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: -4 },
  empty: { fontSize: 14, color: colors.textSecondary },
  card: {
    backgroundColor: colors.card, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 6,
  },
  cardTitle: {
    fontSize: 13, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  seasonName: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },

  // Carousel dots
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: -2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 18 },

  // Metric tiles
  tiles: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1, backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 2,
  },
  tileLabel: { fontSize: 13, color: colors.textSecondary },
  tileValue: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },

  // All matches row
  allMatches: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  allMatchesLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  allMatchesTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  allMatchesSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Non-player view
  matchDayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border,
  },
  matchDayName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  matchDayDate: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  matchCount: { fontSize: 13, color: colors.textSecondary },
})
