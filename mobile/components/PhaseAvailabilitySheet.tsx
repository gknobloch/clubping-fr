import { Pressable, ScrollView, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppData } from '@/contexts/DataContext'
import { getTeamName } from '@/utils/roles'
import { useOpenPlayer } from '@/utils/openFiche'
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
import { Sheet, sheetContentWidth } from '@/components/Sheet'
import {
  PhaseAvailabilityLegend,
  PhaseAvailabilityTable,
  phaseTableColumns,
  type RenfortsAnchor,
} from '@/components/PhaseAvailabilityTable'
import { Avatar } from '@/components/Avatar'
import { AVAIL } from '@/constants/availability'
import type { PhaseRenfort } from '@shared/lib/phaseAvailability'
import type { Team } from '@shared/types'

// ---------------------------------------------------------------------------
// Disponibilités de la phase (#623) — opened from the fiche équipe.
//
// A sheet, not a pushed screen: a pushed screen keeps the app header and the
// tab bar, ~120pt of a phone on its side that is ~400pt tall, and a team of
// six with both totals does not fit in what is left. The sheet covers both,
// and turns with the phone (`rotates`).
//
// It shows the phase of the team it was opened from — the fiche is already
// one team in one phase, so a phase switcher would be a second answer to a
// question the caller has settled. The subtitle names it.
//
// Leaving it is a navigation: a name opens the fiche, a journée the match,
// and the sheet closes first. A second sheet on top would be portrait-only
// on iOS, under a member who is holding the phone sideways — which is also
// why the renforts' names open in a popover drawn *inside* this sheet rather
// than in a Modal of its own.
// ---------------------------------------------------------------------------

export function PhaseAvailabilitySheet({ team, onClose }: { team: Team; onClose: () => void }) {
  const {
    teams, players, clubs, phases, groups, divisions, matchDays, games,
    gameAvailabilities, gameSelections, seasons, playerSeasonLicences,
  } = useAppData()
  const router = useRouter()
  const openPlayer = useOpenPlayer()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const { width, isTablet, isLandscape } = useLayout()

  const entry = useMemo(
    () => teamPhaseEntries(team, teams, phases, matchDays, games).find((e) => e.teamId === team.id),
    [team, teams, phases, matchDays, games],
  )
  const phaseGames = useMemo(() => entry?.games ?? [], [entry])

  const grid = useMemo(
    () => phaseAvailabilityGrid(team, phaseGames, players, gameAvailabilities, gameSelections),
    [team, phaseGames, players, gameAvailabilities, gameSelections],
  )
  const columns = useMemo(() => phaseAvailabilityColumns(phaseGames), [phaseGames])
  const required = playersRequired(team, groups, divisions)

  const unlicensed = useMemo(
    () =>
      unlicensedIds(
        playerSeasonLicences,
        seasons.find((s) => s.status === 'active')?.id,
        players.filter((p) => p.clubId === team.clubId),
      ),
    [playerSeasonLicences, seasons, players, team.clubId],
  )

  const compact = !isTablet
  // A phone on its side: six players and both totals in what the sheet has.
  const dense = !isTablet && isLandscape
  const tableWidth = sheetContentWidth({ width, isTablet, wide: true, dense, insets })
  const { overflows } = phaseTableColumns(tableWidth, columns.length, compact, dense)
  const subtitle = [getTeamName(team, clubs), entry?.label].filter(Boolean).join(' · ')

  // The Renforts popover: which match, and where its cell sits. The container
  // is measured at the same moment, so the popover lands relative to it.
  const containerRef = useRef<View>(null)
  const [popover, setPopover] = useState<{
    gameId: string
    anchor: RenfortsAnchor | null
    frame: RenfortsAnchor | null
  } | null>(null)
  const openRenforts = (gameId: string, anchor: RenfortsAnchor | null) => {
    setPopover((prev) => ({ gameId, anchor, frame: prev?.gameId === gameId ? prev.frame : null }))
    if (anchor) {
      containerRef.current?.measureInWindow?.((x, y, w, h) =>
        setPopover((prev) =>
          prev?.gameId === gameId ? { ...prev, frame: { x, y, width: w, height: h } } : prev,
        ),
      )
    }
  }
  const popoverIndex = popover ? columns.findIndex((c) => c.gameId === popover.gameId) : -1

  const leaveFor = (go: () => void) => {
    onClose()
    go()
  }

  return (
    <Sheet
      onClose={onClose}
      testID="phase-sheet"
      wide
      dense={dense}
      rotates
      // Sideways, the whole height bar a sliver of backdrop: that sliver is
      // what says «sheet», and every other point is a row.
      maxHeight={dense ? height - 12 : '85%'}
    >
      <View ref={containerRef} style={s.container}>
        <View style={[s.titleRow, dense && s.titleRowDense]}>
          {dense ? (
            <Text style={s.titleLine} numberOfLines={1}>
              <Text style={s.titleDense}>Disponibilités</Text>
              <Text style={s.subtitleInline}>{`  ${subtitle}`}</Text>
            </Text>
          ) : (
            <View style={s.titleBlock}>
              <Text style={s.title}>Disponibilités de la phase</Text>
              <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>
            </View>
          )}
          <TouchableOpacity
            testID="phase-sheet-close"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            hitSlop={8}
            style={[s.close, dense && s.closeDense]}
          >
            <Ionicons name="close" size={dense ? 20 : 22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Une phase entière ne tient pas debout sur un téléphone ; couchée, si. */}
        {overflows && !isLandscape && !isTablet && (
          <View style={s.hint} testID="phase-rotate-hint">
            <Ionicons name="phone-landscape-outline" size={18} color={colors.textSecondary} />
            <Text style={s.hintText}>Tournez le téléphone pour voir toute la phase.</Text>
          </View>
        )}

        {/* flexShrink: under the capped panel a ScrollView otherwise claims its
            whole content's height and pushes past the sheet (CLAUDE.md). */}
        <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, dense && s.scrollContentDense]}>
          {grid.rows.length > 0 && columns.length > 0 ? (
            <>
              <PhaseAvailabilityTable
                grid={grid}
                columns={columns}
                width={tableWidth}
                compact={compact}
                dense={dense}
                required={required}
                unlicensed={unlicensed}
                onPlayer={(playerId) => leaveFor(() => openPlayer(playerId))}
                onRenforts={openRenforts}
                onGame={(gameId) =>
                  leaveFor(() =>
                    router.push({
                      pathname: '/match/[id]',
                      params: { id: gameId, teamId: team.id, from: 'team' },
                    }),
                  )
                }
              />
              {/* Under the table, not above it: sideways the rows are what has
                  to fit, and OUI / PE / NON read on their own. */}
              <PhaseAvailabilityLegend />
            </>
          ) : (
            <Text style={s.empty}>
              {columns.length === 0 ? 'Aucun match sur cette phase.' : 'Aucun joueur dans cette équipe.'}
            </Text>
          )}
        </ScrollView>

        {popover && popoverIndex >= 0 && (
          <>
            <Pressable
              testID="renforts-popover-backdrop"
              style={StyleSheet.absoluteFill}
              onPress={() => setPopover(null)}
            />
            <RenfortsPopover
              title={`Renforts · J${columns[popoverIndex].number}`}
              renforts={grid.renforts[popoverIndex]}
              placement={popoverPlacement(popover.anchor, popover.frame)}
            />
          </>
        )}
      </View>
    </Sheet>
  )
}

const POPOVER_WIDTH = 240
const POPOVER_GAP = 6

/**
 * Above the tapped cell, centred on it and kept inside the sheet: the Renforts
 * row sits right over the totals, so below it there is rarely room, and above
 * it is the roster. Until both measures land — or where nothing measures, as
 * under test — it sits centred at the top of the sheet's content.
 */
export function popoverPlacement(anchor: RenfortsAnchor | null, frame: RenfortsAnchor | null) {
  if (!anchor || !frame) return { top: 40, left: undefined, alignSelf: 'center' as const }
  const centre = anchor.x - frame.x + anchor.width / 2
  const left = Math.max(0, Math.min(frame.width - POPOVER_WIDTH, centre - POPOVER_WIDTH / 2))
  return { bottom: frame.height - (anchor.y - frame.y) + POPOVER_GAP, left }
}

/** The names behind a stack of faces, and what each answered for that match. */
function RenfortsPopover({
  title,
  renforts,
  placement,
}: {
  title: string
  renforts: PhaseRenfort[]
  placement: ReturnType<typeof popoverPlacement>
}) {
  return (
    <View testID="renforts-popover" style={[s.popover, placement]}>
      <Text style={s.popoverTitle}>{title}</Text>
      {renforts.map((r) => {
        const a = r.status ? AVAIL[r.status] : undefined
        return (
          <View key={r.player.id} style={s.popoverRow}>
            <Avatar
              playerId={r.player.id}
              avatarUpdatedAt={r.player.avatarUpdatedAt}
              firstName={r.player.firstName}
              lastName={r.player.lastName}
              size={28}
            />
            <Text style={s.popoverName} numberOfLines={1}>
              {r.player.firstName} {r.player.lastName}
            </Text>
            <View style={[s.popoverStatus, a ? { backgroundColor: a.bg } : s.popoverStatusNone]}>
              <Text style={[s.popoverStatusText, { color: a ? a.color : colors.tabInactive }]}>
                {a ? a.short : '—'}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flexShrink: 1 },
  popover: {
    position: 'absolute',
    width: POPOVER_WIDTH,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  popoverTitle: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  popoverRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  popoverName: { flex: 1, fontSize: 14, color: colors.textPrimary },
  popoverStatus: { minWidth: 36, paddingHorizontal: 4, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  popoverStatusNone: { backgroundColor: colors.bg },
  popoverStatusText: { fontSize: 10, fontFamily: fonts.semiBold },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  titleRowDense: { marginBottom: 6 },
  titleBlock: { flex: 1 },
  title: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: 2 },
  titleLine: { flex: 1 },
  titleDense: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary },
  subtitleInline: { fontSize: 13, color: colors.textSecondary },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Still a 44pt target with its hitSlop; 28pt of height is what it costs.
  closeDense: { width: 28, height: 28, borderRadius: 14 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: colors.bg,
  },
  hintText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: colors.textSecondary },
  scroll: { flexShrink: 1 },
  scrollContent: { gap: 12 },
  scrollContentDense: { gap: 8 },
  empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', padding: 24 },
})
