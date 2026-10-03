import {
  ScrollView, View, Text, StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { useAppData } from '@/contexts/DataContext'
import { getTeamName } from '@/utils/roles'
import { poolLabel } from '@shared/lib/poolLabel'
import { teamPhaseEntries } from '@shared/lib/teamPhases'
import { gameDate, gameTime, isSlotConfirmed } from '@/utils/matchdays'
import { colors } from '@/constants/colors'
import { Screen, contentWidth } from '@/components/Screen'
import { Switcher } from '@/components/Switcher'
import { MatchHeader } from '@/components/MatchHeader'
import { useOpenTeam } from '@/utils/openFiche'
import { PhaseAvailabilitySheet } from '@/components/PhaseAvailabilitySheet'
import type { Player } from '@shared/types'
import { LIST_PANE_WIDTH, useLayout } from '@/constants/layout'
import { usePaneSelection } from '@/utils/paneSelection'
import { MatchDetail } from '@/components/MatchDetail'
import { fonts } from '@/constants/typography'

// ---------------------------------------------------------------------------
// A team's full phase view: every match of the phase, under two doors — the
// phase planning (#623) and the team's own page. A < > switcher pages through
// the phases this team (club + number) has played, in place — aligned with the
// Équipes / Mes matchs screens. The nav title shows the team name.
//
// It listed the roster with play-counts too, until the planning made that a
// second copy of one of its columns: «Sél.» says the same «3/7», beside the
// answers that explain it. The planning opens from here and not from the fiche
// équipe because it is about the matches — and «Tous les matchs» is where the
// accueil leads a captain with a phase to plan.
// ---------------------------------------------------------------------------
/** Ce que le rail sélectionne quand ce n'est pas un match. */
const RESUME = 'resume'

/** «sam. 5 sept.» — tout ce qu'une entrée de rail a la place de dire. */
function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function PhaseGamesScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>()
  const { teams, players, clubs, phases, divisions, groups, matchDays, games, gameSelections } = useAppData()
  const navigation = useNavigation()
  const router = useRouter()
  const openTeam = useOpenTeam()
  const { isTwoPane } = useLayout()
  const { selectedId, select } = usePaneSelection()

  const [showPlanning, setShowPlanning] = useState(false)
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

  // Lu sur la liste plutôt que gardé à part : le commutateur change de phase,
  // où le match sélectionné n'existe pas — le volet retombe alors sur
  // « Résumé » tout seul, et retrouve le match au retour.
  const selectedGame = teamGames.find((g) => g.id === selectedId)

  const teamSelections = useMemo(
    () => (team ? gameSelections.filter((s) => s.teamId === team.id) : []),
    [gameSelections, team],
  )

  // Club teams in the same phase (for brûlage computation)
  const totalGames = teamGames.length

  if (!baseTeam) {
    return (
      <Screen>
        <Text style={styles.empty}>Équipe introuvable.</Text>
      </Screen>
    )
  }

  const switcher = currentEntry ? (
    <Switcher
      title={currentEntry.label}
      onPrev={phaseIndex > 0 ? () => selectPhase(phaseIndex - 1) : undefined}
      onNext={phaseIndex < ordered.length - 1 ? () => selectPhase(phaseIndex + 1) : undefined}
    />
  ) : null

  /** Toute la phase, joueurs × journées (#623) — dispos et compositions. */
  const planningLink = team && totalGames > 0 ? (
    <TouchableOpacity
      testID="team-phase-planning"
      style={styles.linkRow}
      onPress={() => setShowPlanning(true)}
    >
      <View style={styles.linkLeft}>
        <Ionicons name="grid-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.linkText}>Planning de la phase</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  ) : null

  /** Jamais un cul-de-sac : la fiche de l'équipe est à un geste. */
  const teamLink = team ? (
    <TouchableOpacity style={styles.linkRow} onPress={() => openTeam(team.id)}>
      <View style={styles.linkLeft}>
        <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.linkText}>Voir la fiche équipe</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  ) : null

  const planning = showPlanning && team && (
    <PhaseAvailabilitySheet team={team} onClose={() => setShowPlanning(false)} />
  )

  // -------------------------------------------------------------------------
  // Deux volets, au-dessus du seuil tablette (#585)
  //
  // Le rail *est* la liste des matchs, donc le volet droit porte le match lui-
  // même — disponibilités, composition, feuille — plutôt qu'une carte qu'il
  // faudrait encore ouvrir. « Résumé » garde ce que l'écran montrait en haut :
  // l'effectif et ce que chacun a joué.
  // -------------------------------------------------------------------------
  if (isTwoPane) {
    return (
      <Screen style={styles.split}>
        <View style={styles.railPane}>
          <ScrollView contentContainerStyle={styles.railList}>
            {switcher}
            <TouchableOpacity
              testID="rail-resume"
              style={[styles.railRow, !selectedGame && styles.railRowSelected]}
              accessibilityState={!selectedGame ? { selected: true } : {}}
              onPress={() => select(RESUME)}
            >
              <Text style={[styles.railResume, !selectedGame && styles.railTextSelected]}>
                Résumé
              </Text>
            </TouchableOpacity>

            {teamGames.map((g) => {
              const md = g.matchDay
              if (!md || !team) return null
              const isHome = g.homeTeamId === team.id
              const opp = teams.find((t) => t.id === (isHome ? g.awayTeamId : g.homeTeamId))
              const isSelected = g.id === selectedGame?.id
              return (
                <TouchableOpacity
                  key={g.id}
                  testID={`rail-game-${g.id}`}
                  style={[styles.railRow, isSelected && styles.railRowSelected]}
                  accessibilityState={isSelected ? { selected: true } : {}}
                  onPress={() => select(g.id)}
                >
                  {/* L'adversaire et le côté, puis la journée et la date, et
                      rien d'autre : le reste est dans le volet à côté. */}
                  <View style={styles.railTop}>
                    <Ionicons
                      name={isHome ? 'home' : 'paper-plane-outline'}
                      size={13}
                      color={isSelected ? colors.accent : colors.textSecondary}
                    />
                    <Text
                      style={[styles.railOpponent, isSelected && styles.railTextSelected]}
                      numberOfLines={1}
                    >
                      {opp ? getTeamName(opp, clubs) : '—'}
                    </Text>
                  </View>
                  <Text style={styles.railMeta}>
                    J{md.number} · {shortDate(gameDate(g, md))}
                  </Text>
                </TouchableOpacity>
              )
            })}

            {totalGames === 0 && <Text style={styles.empty}>Aucun match trouvé.</Text>}
          </ScrollView>
        </View>

        <View style={styles.detailPane}>
          {selectedGame && team ? (
            <MatchDetail gameId={selectedGame.id} teamId={team.id} embedded />
          ) : (
            <ScrollView contentContainerStyle={[styles.scroll, contentWidth()]}>
              {planningLink}
              {teamLink}
            </ScrollView>
          )}
        </View>

        {planning}
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.scroll, contentWidth()]}>
        {switcher}
        {planningLink}
        {teamLink}

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
              // This list is the team axis the match screen pages along
              // (#552) — same order, same games.
              onPress={() =>
                router.push({
                  pathname: '/match/[id]',
                  params: { id: g.id, teamId: team.id, from: 'team' },
                })
              }
            >
              <View style={styles.matchCardBody}>
                <MatchHeader
                  matchDayNumber={md.number}
                  divisionLabel={divisions.find((d) => d.id === team.divisionId)?.displayName}
                  poolLabel={poolLabel(team, groups)}
                  teamColor={team.color}
                  teamNumber={team.number}
                  isHome={isHome}
                  teamName={getTeamName(team, clubs)}
                  opponentName={oppName}
                  matchDayDate={gameDate(g, md)}
                  time={gameTime(g, md, teams.find((t) => t.id === g.homeTeamId)) || undefined}
                  confirmed={isSlotConfirmed(g, md, teams.find((t) => t.id === g.homeTeamId))}
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

      {planning}
    </Screen>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  scroll: { gap: 12, padding: 16, paddingBottom: 32 },

  split: { flexDirection: 'row' },
  railPane: {
    width: LIST_PANE_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  detailPane: { flex: 1 },
  railList: { padding: 16, gap: 8 },
  railRow: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
    minHeight: 44,
    justifyContent: 'center',
  },
  // La surface rouge pâle dont l'app se sert déjà pour dire « celle-ci »
  // (#447) — la même que la liste des équipes à côté de sa fiche.
  railRowSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  railTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  railResume: { fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  railOpponent: { flex: 1, fontSize: 15, color: colors.textPrimary },
  railTextSelected: { color: colors.accent, fontFamily: fonts.semiBold },
  railMeta: { fontSize: 12, color: colors.textSecondary },
  empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', padding: 24 },

  // Standalone label above the match-card list.
  listLabel: {
    fontSize: 12, fontFamily: fonts.semiBold, color: colors.textSecondary,
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
  linkText: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
})
