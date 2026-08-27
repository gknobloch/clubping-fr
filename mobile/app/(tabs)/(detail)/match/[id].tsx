import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppData } from '@/contexts/DataContext'
import { canManageTeam, getTeamName } from '@/utils/roles'
import { colors } from '@/constants/colors'
import { Screen, contentWidth } from '@/components/Screen'
import { MatchHeader } from '@/components/MatchHeader'
import { PlayerRow } from '@/components/PlayerRow'
import { PlayerSheet } from '@/components/PlayerSheet'
import type { PlayerHistoryEntry } from '@/components/PlayerSheet'
import { CaptainSelectionSheet } from '@/components/CaptainSelectionSheet'
import { MatchSheet } from '@/components/MatchSheet'
import { buildMatchEvent } from '@/utils/calendar'
import { openMatchInCalendar } from '@/utils/addToCalendar'
import { gameDate, gameTime, isSlotConfirmed, playersCommittedElsewhere } from '@/utils/matchdays'
import { computeBrulage } from '@shared/lib/brulage'
import { sortByName } from '@shared/lib/sortByName'
import { pointsFor } from '@shared/lib/phasePoints'
import { todayIso } from '@/utils/weeks'
import type { Player } from '@shared/types'
import { fonts } from '@/constants/typography'

// ---------------------------------------------------------------------------
// Match detail — one team's view of a game: availabilities (editable by the
// captain / club-admin for everyone, by a player for themselves) and the
// line-up. Opened from a Journées card; back returns there.
// ---------------------------------------------------------------------------
export default function MatchDetailScreen() {
  const { id, teamId } = useLocalSearchParams<{ id: string; teamId: string }>()
  const navigation = useNavigation()
  const router = useRouter()
  const { user } = useAuth()
  const {
    clubs, teams, players, matchDays, games, phases, divisions, groups,
    gameAvailabilities, gameSelections, playerPhasePoints,
    setAvailability, clearAvailability, setGameSelection,
  } = useAppData()

  const [showCompose, setShowCompose] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [quickViewPlayer, setQuickViewPlayer] = useState<Player | null>(null)
  const game = games.find((g) => g.id === id)
  const team = teams.find((t) => t.id === teamId)
  const matchDay = game ? matchDays.find((md) => md.id === game.matchDayId) : undefined

  useEffect(() => {
    if (matchDay) navigation.setOptions({ title: `Journée ${matchDay.number}` })
  }, [matchDay, navigation])

  const today = todayIso()
  const myPlayerId = user?.isPlayer ? user.id : undefined

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  const roster = useMemo(
    () => (team ? sortByName(team.playerIds.map((pid) => playerMap.get(pid)).filter(Boolean) as Player[]) : []),
    [team, playerMap],
  )
  const clubTeamsInPhase = useMemo(
    () => (team ? teams.filter((t) => t.clubId === team.clubId && t.phaseId === team.phaseId) : []),
    [teams, team],
  )
  const allClubPlayers = useMemo(
    () => (team ? players.filter((p) => p.clubId === team.clubId) : []),
    [players, team],
  )

  if (!game || !team || !matchDay) {
    return (
      <Screen>
        <Text style={styles.notFound}>Match introuvable.</Text>
      </Screen>
    )
  }

  const isHome = game.homeTeamId === team.id
  const oppTeamId = isHome ? game.awayTeamId : game.homeTeamId
  const oppTeam = teams.find((t) => t.id === oppTeamId)
  const opponentName = oppTeam ? getTeamName(oppTeam, clubs) : '?'

  const grp = groups.find((g) => g.id === team.groupId)
  const div = grp ? divisions.find((d) => d.id === grp.divisionId) : undefined
  const playersPerGame = div?.playersPerGame ?? 4

  const homeTeam = teams.find((t) => t.id === game.homeTeamId)
  const gameLocation = homeTeam
    ? clubs.flatMap((c) => c.addresses ?? []).find((a) => a.id === homeTeam.gameLocationId)
    : undefined
  // No game-location address → fall back to the home club's own.
  const homeClub = homeTeam ? clubs.find((c) => c.id === homeTeam.clubId) : undefined
  const clubAddress = homeClub?.addresses?.find((a) => a.isDefault) ?? homeClub?.addresses?.[0]
  // The header stays short — venue and city, or just the city for the fallback.
  // The calendar event gets the whole address instead (#416).
  const venueLabel = gameLocation
    ? gameLocation.label ? `${gameLocation.label}, ${gameLocation.city}` : gameLocation.city
    : clubAddress?.city

  const teamName = getTeamName(team, clubs)
  const matchup = isHome ? `${teamName} – ${opponentName}` : `${opponentName} – ${teamName}`

  const selection = gameSelections.find((s) => s.teamId === team.id && s.gameId === game.id)?.playerIds ?? []
  const selectedPlayers = selection.map((pid) => playerMap.get(pid)).filter(Boolean) as Player[]
  const rosterIds = new Set(roster.map((p) => p.id))
  const borrowedSelected = selectedPlayers.filter((p) => !rosterIds.has(p.id))

  const committed = playersCommittedElsewhere(
    team.id, matchDay.number, clubTeamsInPhase, games, matchDays, gameSelections,
  )

  const canManage = !!(user && canManageTeam(user, team))
  const thisGameDate = gameDate(game, matchDay)
  // The receiving club's time (#287): the game's own, else the home team's
  // default, and none at all when that club's playing day is unknown.
  const thisGameTime = gameTime(game, matchDay, homeTeam)
  // Until that club's playing day is known, the date is the FFTT's guess (#429).
  const slotConfirmed = isSlotConfirmed(game, matchDay, homeTeam)
  const gameDatePast = thisGameDate < today
  const getAvail = (pid: string) =>
    gameAvailabilities.find((a) => a.playerId === pid && a.gameId === game.id)?.status

  // Built out here rather than inside the handler: `game` and `matchDay` are
  // narrowed by the guard above, and that narrowing does not survive into a
  // nested function.
  const calendarEvent = buildMatchEvent({
    date: thisGameDate,
    time: thisGameTime,
    matchup,
    matchDayNumber: matchDay.number,
    divisionLabel: div?.displayName,
    playersPerGame,
    address: gameLocation ?? clubAddress,
    venueLabel,
  })


  // Game history (this phase, across the club's teams) for the quick-view sheet.
  function historyFor(player: Player): PlayerHistoryEntry[] {
    const rows: { e: PlayerHistoryEntry; raw: string }[] = []
    for (const t of clubTeamsInPhase) {
      for (const g of games) {
        if (g.homeTeamId !== t.id && g.awayTeamId !== t.id) continue
        const s = gameSelections.find((x) => x.teamId === t.id && x.gameId === g.id)
        if (!s?.playerIds.includes(player.id)) continue
        const md = matchDays.find((m) => m.id === g.matchDayId)
        if (!md) continue
        const home = g.homeTeamId === t.id
        const opp = teams.find((x) => x.id === (home ? g.awayTeamId : g.homeTeamId))
        const gDate = gameDate(g, md)
        rows.push({
          raw: gDate,
          e: {
            jNumber: md.number,
            icon: home ? 'home' : 'paper-plane-outline',
            text: opp ? getTeamName(opp, clubs) : '—',
            team: t,
            date: new Date(gDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
            isPast: gDate < today,
          },
        })
      }
    }
    return rows.sort((a, b) => a.raw.localeCompare(b.raw)).map((r) => r.e)
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.scroll, contentWidth()]}>
        {/* Summary */}
        <View style={styles.card}>
          <MatchHeader
            matchDayNumber={matchDay.number}
            divisionLabel={div?.displayName}
            teamColor={team.color}
            teamNumber={team.number}
            isHome={isHome}
            teamName={teamName}
            opponentName={opponentName}
            matchDayDate={thisGameDate}
            time={thisGameTime || undefined}
            confirmed={slotConfirmed}
            venueLabel={venueLabel}
            onAddToCalendar={() => openMatchInCalendar(calendarEvent)}
          />
        </View>

        {/* Availabilities + line-up (check = selected) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Disponibilités</Text>
          {roster.map((p) => {
            const lockedTeam = !selection.includes(p.id) ? committed.get(p.id) : undefined
            if (lockedTeam !== undefined) {
              return (
                <PlayerRow
                  key={p.id}
                  player={p}
                  availability={undefined}
                  selected={false}
                  isMe={p.id === myPlayerId}
                  canEdit={false}
                  gameDatePast={gameDatePast}
                  lockedReason={`Joue en Équipe ${lockedTeam}`}
                  onPickAvailability={() => {}}
                  onClear={() => {}}
                  onPressName={() => setQuickViewPlayer(p)}
                />
              )
            }
            const canEdit = (canManage || p.id === myPlayerId) && !gameDatePast
            return (
              <PlayerRow
                key={p.id}
                player={p}
                availability={getAvail(p.id)}
                selected={selection.includes(p.id)}
                isMe={p.id === myPlayerId}
                canEdit={canEdit}
                gameDatePast={gameDatePast}
                onPickAvailability={(status) => setAvailability(p.id, game.id, status)}
                onClear={() => clearAvailability(p.id, game.id)}
                onPressName={() => setQuickViewPlayer(p)}
              />
            )
          })}
          {borrowedSelected.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              availability={undefined}
              selected
              isMe={p.id === myPlayerId}
              canEdit={false}
              gameDatePast={gameDatePast}
              borrowed
              onPickAvailability={() => {}}
              onClear={() => {}}
              onPressName={() => setQuickViewPlayer(p)}
            />
          ))}
        </View>

        {/* Compose (captain / club-admin) */}
        {canManage && !gameDatePast && (
          <TouchableOpacity style={styles.compose} onPress={() => setShowCompose(true)}>
            <View style={styles.composeLeft}>
              <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.composeTxt}>Composer l'équipe</Text>
            </View>
            <View style={styles.composeRight}>
              <Text style={[styles.composeCount, { color: selection.length >= playersPerGame ? colors.success : colors.warning }]}>
                {selection.length}/{playersPerGame}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        )}

        {/* Feuille de match — read-only, for everyone */}
        <TouchableOpacity style={styles.compose} onPress={() => setShowSheet(true)}>
          <View style={styles.composeLeft}>
            <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.composeTxt}>Feuille de match</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Jump to the team's full phase view (roster + all matches) */}
        <TouchableOpacity
          style={styles.compose}
          onPress={() =>
            router.push({
              pathname: '/team/phase-games',
              params: { teamId: team.id },
            })
          }
        >
          <View style={styles.composeLeft}>
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.composeTxt}>Tous les matchs de l'équipe</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>

      {showCompose && (
        <CaptainSelectionSheet
          team={team}
          teamPlayers={roster}
          clubs={clubs}
          playersPerGame={playersPerGame}
          getAvailability={(pid) => getAvail(pid)}
          initialSelection={selection}
          selectionData={{
            matchDayId: game.matchDayId,
            allClubPlayers,
            clubTeams: clubTeamsInPhase,
            matchDays,
            games,
            gameSelections,
          }}
          onSave={(ids) => setGameSelection(team.id, game.id, ids)}
          onClose={() => setShowCompose(false)}
        />
      )}

      {quickViewPlayer && (() => {
        const viewTeam = clubTeamsInPhase.find((t) => t.playerIds.includes(quickViewPlayer.id)) ?? team
        const viewPhase = phases.find((p) => p.id === team.phaseId)
        const brulage = computeBrulage(quickViewPlayer.id, clubTeamsInPhase, matchDays, games, gameSelections)
        const brulageTeam = brulage.burnedIntoTeamId
          ? teams.find((t) => t.id === brulage.burnedIntoTeamId) ?? null
          : null
        const history = historyFor(quickViewPlayer)
        const totalPlayed = games.filter((g) => {
          if (g.homeTeamId !== viewTeam.id && g.awayTeamId !== viewTeam.id) return false
          const md = matchDays.find((m) => m.id === g.matchDayId)
          return !!md && gameDate(g, md) < today
        }).length
        return (
          <PlayerSheet
            player={quickViewPlayer}
            phaseLabel={viewPhase ? `Saison ${viewPhase.displayName}` : undefined}
            phasePoints={pointsFor(playerPhasePoints, viewTeam.phaseId, quickViewPlayer.id)}
            gamesPlayed={history.filter((e) => e.isPast).length}
            gamesTotal={totalPlayed}
            team={viewTeam}
            brulageTeam={brulageTeam}
            history={history}
            onClose={() => setQuickViewPlayer(null)}
          />
        )
      })()}

      {showSheet && (() => {
        const club = clubs.find((c) => c.id === team.clubId)
        const sheetPlayers = (selection
          .map((pid) => playerMap.get(pid))
          .filter(Boolean) as Player[])
          .map((p) => ({
            firstName: p.firstName,
            lastName: p.lastName,
            license: p.licenseNumber,
            // A renfort brings their own points: they hang off the phase, not
            // off whichever team fields them (#384).
            points: pointsFor(playerPhasePoints, team.phaseId, p.id),
          }))
        return (
          <MatchSheet
            matchup={matchup}
            clubName={club?.displayName ?? ''}
            affiliationNumber={club?.affiliationNumber ?? ''}
            players={sheetPlayers}
            onClose={() => setShowSheet(false)}
          />
        )
      })()}
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },
  notFound: { padding: 24, color: colors.textSecondary, textAlign: 'center' },

  card: {
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8,
  },
  sectionTitle: {
    fontSize: 12, fontFamily: fonts.semiBold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
  },

  compose: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 14,
  },
  composeLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composeTxt: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  composeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  composeCount: { fontSize: 14, fontFamily: fonts.bold },
})
