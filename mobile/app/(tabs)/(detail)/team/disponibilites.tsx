import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppData } from '@/contexts/DataContext'
import { getTeamName } from '@/utils/roles'
import { teamPhaseEntries } from '@shared/lib/teamPhases'
import {
  phaseAvailabilityColumns,
  phaseAvailabilityGrid,
  playersRequired,
} from '@shared/lib/phaseAvailability'
import { unlicensedIds } from '@shared/lib/seasonLicences'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { useLayout } from '@/constants/layout'
import { Screen } from '@/components/Screen'
import { Switcher } from '@/components/Switcher'
import { PlayerQuickView } from '@/components/PlayerQuickView'
import {
  PhaseAvailabilityLegend,
  PhaseAvailabilityTable,
  phaseTableColumns,
} from '@/components/PhaseAvailabilityTable'

// ---------------------------------------------------------------------------
// Disponibilités de la phase (#623) — pushed from the fiche équipe.
//
// The same < phase > switcher as «Tous les matchs de cette équipe», over the
// grid of `PhaseAvailabilityTable`. Phases are the ones this team (club +
// number) has matches in: a phase with no calendar has no columns to show.
// ---------------------------------------------------------------------------

/** Wider than this and a row of seven cells is seven islands. */
const TABLE_MAX_WIDTH = 960
const PADDING = 16

export default function PhaseAvailabilityScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>()
  const {
    teams, players, clubs, phases, groups, divisions, matchDays, games,
    gameAvailabilities, gameSelections, seasons, playerSeasonLicences,
  } = useAppData()
  const navigation = useNavigation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, isTablet, isLandscape } = useLayout()

  const [phaseId, setPhaseId] = useState<string | undefined>(undefined)
  const [playerId, setPlayerId] = useState<string | null>(null)

  const baseTeam = teams.find((t) => t.id === teamId)

  useEffect(() => {
    if (baseTeam) navigation.setOptions({ title: getTeamName(baseTeam, clubs) })
  }, [baseTeam, clubs, navigation])

  const ordered = useMemo(
    () =>
      baseTeam
        ? teamPhaseEntries(baseTeam, teams, phases, matchDays, games).sort((a, b) =>
            a.label.localeCompare(b.label),
          )
        : [],
    [baseTeam, teams, phases, matchDays, games],
  )

  // The tapped team's own phase, else the active one, else the latest.
  const fallbackPhaseId =
    ordered.find((e) => e.phaseId === baseTeam?.phaseId)?.phaseId ??
    ordered.find((e) => e.isActive)?.phaseId ??
    ordered[ordered.length - 1]?.phaseId
  const current = ordered.find((e) => e.phaseId === (phaseId ?? fallbackPhaseId))
  const index = ordered.findIndex((e) => e.phaseId === current?.phaseId)
  const team = teams.find((t) => t.id === current?.teamId)
  const phaseGames = useMemo(() => current?.games ?? [], [current])

  const grid = useMemo(
    () =>
      team
        ? phaseAvailabilityGrid(team, phaseGames, players, gameAvailabilities, gameSelections)
        : { rows: [], availableByGame: [] },
    [team, phaseGames, players, gameAvailabilities, gameSelections],
  )

  const columns = useMemo(() => phaseAvailabilityColumns(phaseGames), [phaseGames])
  const required = playersRequired(team, groups, divisions)

  const unlicensed = useMemo(
    () =>
      unlicensedIds(
        playerSeasonLicences,
        seasons.find((s) => s.status === 'active')?.id,
        players.filter((p) => p.clubId === team?.clubId),
      ),
    [playerSeasonLicences, seasons, players, team?.clubId],
  )

  if (!baseTeam) {
    return (
      <Screen>
        <Text style={styles.empty}>Équipe introuvable.</Text>
      </Screen>
    )
  }

  const compact = !isTablet
  const tableWidth = Math.min(TABLE_MAX_WIDTH, width - insets.left - insets.right - PADDING * 2)
  const { overflows } = phaseTableColumns(tableWidth, columns.length, compact)

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: TABLE_MAX_WIDTH + PADDING * 2 }]}>
        {current && (
          <Switcher
            title={current.label}
            onPrev={index > 0 ? () => setPhaseId(ordered[index - 1].phaseId) : undefined}
            onNext={index < ordered.length - 1 ? () => setPhaseId(ordered[index + 1].phaseId) : undefined}
          />
        )}

        {/* Une phase entière ne tient pas debout sur un téléphone ; couchée, si. */}
        {overflows && !isLandscape && !isTablet && (
          <View style={styles.hint} testID="phase-rotate-hint">
            <Ionicons name="phone-landscape-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.hintText}>Tournez le téléphone pour voir toute la phase.</Text>
          </View>
        )}

        {grid.rows.length > 0 && columns.length > 0 ? (
          <>
            <PhaseAvailabilityLegend />
            <PhaseAvailabilityTable
              grid={grid}
              columns={columns}
              width={tableWidth}
              compact={compact}
              required={required}
              unlicensed={unlicensed}
              onPlayer={setPlayerId}
              onGame={(gameId) =>
                team &&
                router.push({
                  pathname: '/match/[id]',
                  params: { id: gameId, teamId: team.id, from: 'team' },
                })
              }
            />
          </>
        ) : (
          <Text style={styles.empty}>
            {columns.length === 0 ? 'Aucun match sur cette phase.' : 'Aucun joueur dans cette équipe.'}
          </Text>
        )}
      </ScrollView>

      {playerId && team && (
        <PlayerQuickView
          playerId={playerId}
          team={team}
          phaseLabel={current?.label}
          onClose={() => setPlayerId(null)}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { gap: 12, padding: PADDING, paddingBottom: 32, width: '100%', alignSelf: 'center' },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: colors.textSecondary },
  empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', padding: 24 },
})
