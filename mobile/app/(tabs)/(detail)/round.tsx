import { useEffect, useMemo } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { useAppData } from '@/contexts/DataContext'
import { Screen } from '@/components/Screen'
import { MatchDetail } from '@/components/MatchDetail'
import { TeamColorBadge } from '@/components/TeamColorBadge'
import { getTeamName } from '@/utils/roles'
import { gameDate } from '@/utils/matchdays'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { LIST_PANE_WIDTH, useLayout } from '@/constants/layout'
import { usePaneSelection } from '@/utils/paneSelection'
import { gameAxisSteps, type GameStep } from '@shared/lib/gameNeighbours'

// ---------------------------------------------------------------------------
// Une journée, et les matchs du club dedans (#585)
//
// La date d'une colonne de la matrice menait droit au match, par-dessus la
// grille. Or ce qu'on tient en cliquant une journée, c'est la journée : les
// rencontres du club ce jour-là, à comparer. C'est le pendant de « Tous les
// matchs de cette équipe » sur l'autre axe (#552) — même rail, même volet.
//
// Ce que le rail liste vient de `gameAxisSteps`, la dérivation que le balayage
// parcourt déjà : le rail et le carrousel ne peuvent donc pas tenir deux
// calendriers différents.
// ---------------------------------------------------------------------------

/**
 * Une entrée du rail est une paire (rencontre, équipe), jamais un `gameId`
 * (#552) — deux équipes d'un même club peuvent s'affronter, et l'écran de
 * match est la vue d'*une* équipe sur la rencontre. D'où une clé composite :
 * un `gameId` seul ne distinguerait pas les deux côtés d'un derby.
 */
const keyOf = (step: { gameId: string; teamId: string }) => `${step.gameId}|${step.teamId}`

/** «sam. 5 sept.» — tout ce qu'une entrée de rail a la place de dire. */
function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function RoundScreen() {
  const { gameId, teamId } = useLocalSearchParams<{ gameId: string; teamId: string }>()
  const navigation = useNavigation()
  const { teams, clubs, games, matchDays, phases } = useAppData()
  const { isTwoPane } = useLayout()
  const { selectedId, select } = usePaneSelection()

  const steps = useMemo(
    () => gameAxisSteps({ gameId, teamId }, 'round', { teams, games, matchDays, phases }),
    [gameId, teamId, teams, games, matchDays, phases],
  )

  // The fixture the screen opened on, until the rail says otherwise.
  const opened: GameStep | undefined =
    steps.find((s) => s.gameId === gameId && s.teamId === teamId) ?? steps[0]
  const current = steps.find((s) => keyOf(s) === selectedId) ?? opened

  useEffect(() => {
    if (opened) navigation.setOptions({ title: `Journée ${opened.matchDayNumber}` })
  }, [opened, navigation])

  if (!current) {
    return (
      <Screen>
        <Text style={styles.empty}>Journée introuvable.</Text>
      </Screen>
    )
  }

  // Below the threshold there is no rail to put beside it — and nothing reaches
  // this screen from a phone anyway, the matrice being tablet-only. A window
  // narrowed mid-session keeps the match being read rather than being handed a
  // list nobody asked for.
  if (!isTwoPane) return <MatchDetail gameId={current.gameId} teamId={current.teamId} from="round" />

  return (
    <Screen style={styles.split}>
      <View style={styles.railPane}>
        <ScrollView contentContainerStyle={styles.railList}>
          {steps.map((step) => {
            const team = teams.find((t) => t.id === step.teamId)
            const game = games.find((g) => g.id === step.gameId)
            const matchDay = game ? matchDays.find((md) => md.id === game.matchDayId) : undefined
            if (!team || !game || !matchDay) return null
            const isHome = game.homeTeamId === team.id
            const opponent = teams.find(
              (t) => t.id === (isHome ? game.awayTeamId : game.homeTeamId),
            )
            const isSelected = keyOf(step) === keyOf(current)
            return (
              <TouchableOpacity
                key={keyOf(step)}
                testID={`round-game-${step.gameId}-${step.teamId}`}
                style={[styles.railRow, isSelected && styles.railRowSelected]}
                accessibilityState={isSelected ? { selected: true } : {}}
                onPress={() => select(keyOf(step))}
              >
                {/* L'équipe du club, puis contre qui et quand : sur cet axe
                    c'est l'équipe qui change, là où sur l'axe d'une équipe
                    c'était la journée. */}
                <View style={styles.railTop}>
                  <TeamColorBadge color={team.color} number={team.number} size={26} />
                  <Text
                    style={[styles.railTeam, isSelected && styles.railTextSelected]}
                    numberOfLines={1}
                  >
                    {getTeamName(team, clubs)}
                  </Text>
                </View>
                <View style={styles.railTop}>
                  <Ionicons
                    name={isHome ? 'home' : 'paper-plane-outline'}
                    size={13}
                    color={isSelected ? colors.accent : colors.textSecondary}
                  />
                  <Text style={styles.railOpponent} numberOfLines={1}>
                    {opponent ? getTeamName(opponent, clubs) : '—'}
                  </Text>
                </View>
                <Text style={styles.railMeta}>{shortDate(gameDate(game, matchDay))}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      <View style={styles.detailPane}>
        {/* Keyed on the stop so the pane starts at the top of the next match
            rather than where the last one was left. */}
        <MatchDetail
          key={keyOf(current)}
          gameId={current.gameId}
          teamId={current.teamId}
          embedded
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', padding: 24 },

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
    gap: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  railRowSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  railTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  railTeam: { flex: 1, fontSize: 15, fontFamily: fonts.semiBold, color: colors.textPrimary },
  railOpponent: { flex: 1, fontSize: 14, color: colors.textPrimary },
  railTextSelected: { color: colors.accent },
  railMeta: { fontSize: 12, color: colors.textSecondary },
})
