import { Pressable, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppData } from '@/contexts/DataContext'
import { getTeamName } from '@/utils/roles'
import { useOpenPlayer } from '@/utils/openFiche'
import { teamPhaseEntries } from '@shared/lib/teamPhases'
import {
  lentKeyTeam,
  phaseAvailabilityColumns,
  phaseAvailabilityGrid,
  playersRequired,
} from '@shared/lib/phaseAvailability'
import { unlicensedIds } from '@shared/lib/seasonLicences'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import { useLayout } from '@/constants/layout'
import { Sheet, WIDE_DIALOG_MAX_WIDTH, sheetContentWidth } from '@/components/Sheet'
import {
  CompositionKey,
  LentKey,
  PhaseAvailabilityTable,
  phaseTableColumns,
  type RenfortsAnchor,
} from '@/components/PhaseAvailabilityTable'
import { Avatar } from '@/components/Avatar'
import { TeamColorBadge } from '@/components/TeamColorBadge'
import type { Player, Team } from '@shared/types'

// ---------------------------------------------------------------------------
// Le planning de la phase (#623) — opened from «Tous les matchs».
//
// A sheet, not a pushed screen: a pushed screen keeps the app header and the
// tab bar, ~120pt of a phone on its side that is ~400pt tall, and a team of
// six with both totals does not fit in what is left. The sheet covers both,
// and turns with the phone, as every sheet does (#625).
//
// It shows the phase of the team it is given — the screen that opens it has
// already chosen one with its own switcher, so a second switcher here would
// be a second answer to a question settled underneath. The title names it.
//
// The content is `PhaseAvailabilityPanel`, which a tablet draws straight into
// the pane beside «Tous les matchs» instead (`inline`): there is room for the
// whole grid there, and a sheet over a pane that has nothing else to show
// would be a door to an empty room.
//
// Leaving the sheet is a navigation: a name opens the fiche, a journée the
// match, and the sheet closes first. The renforts' names open in a popover
// drawn *inside* this sheet rather than in a Modal of its own — chosen when a
// second sheet would have been portrait-only on iOS. Every sheet turns since
// #625; the popover stays, anchored to the cell it explains.
// ---------------------------------------------------------------------------

export function PhaseAvailabilitySheet({ team, onClose }: { team: Team; onClose: () => void }) {
  const router = useRouter()
  const openPlayer = useOpenPlayer()
  const { isTablet, isLandscape } = useLayout()
  const dense = !isTablet && isLandscape

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
    >
      <PhaseAvailabilityPanel
        team={team}
        onClose={onClose}
        onPlayer={(playerId) => leaveFor(() => openPlayer(playerId))}
        onGame={(gameId) =>
          leaveFor(() =>
            router.push({
              pathname: '/match/[id]',
              params: { id: gameId, teamId: team.id, from: 'team' },
            }),
          )
        }
      />
    </Sheet>
  )
}

/**
 * The planning itself — title, keys, grid and its popovers — for a sheet or
 * for a pane (`inline`). What a tap on a name or a journée does belongs to the
 * host: a sheet closes and navigates, a pane selects beside itself.
 */
export function PhaseAvailabilityPanel({
  team,
  inline = false,
  onClose,
  onPlayer,
  onGame,
  onTeam,
}: {
  team: Team
  /** Drawn in a pane rather than a sheet: sized to its own width, no ✕. */
  inline?: boolean
  /** The sheet's ✕; absent inline. */
  onClose?: () => void
  onPlayer: (playerId: string) => void
  onGame: (gameId: string) => void
  /** Makes the team's name a way to its fiche. */
  onTeam?: () => void
}) {
  const {
    teams, players, clubs, phases, groups, divisions, matchDays, games,
    gameAvailabilities, gameSelections, seasons, playerSeasonLicences,
  } = useAppData()
  const insets = useSafeAreaInsets()
  const { width, isTablet, isLandscape } = useLayout()
  // Inline, the pane's own width — measured, since a pane is the window less
  // a rail and a list, and only layout knows what that leaves.
  const [paneWidth, setPaneWidth] = useState(0)

  const entry = useMemo(
    () => teamPhaseEntries(team, teams, phases, matchDays, games).find((e) => e.teamId === team.id),
    [team, teams, phases, matchDays, games],
  )
  const phaseGames = useMemo(() => entry?.games ?? [], [entry])

  const grid = useMemo(
    // The club's calendar too: who another team fields on a journée shows here
    // as lent, and counts in «Sél.».
    () =>
      phaseAvailabilityGrid(team, phaseGames, players, gameAvailabilities, gameSelections, {
        teams,
        games,
        matchDays,
      }),
    [team, phaseGames, players, gameAvailabilities, gameSelections, teams, games, matchDays],
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
  const dense = !inline && !isTablet && isLandscape
  const tableWidth = inline
    ? Math.min(WIDE_DIALOG_MAX_WIDTH, paneWidth - INLINE_PADDING * 2)
    : sheetContentWidth({ width, isTablet, wide: true, dense, insets })
  const { overflows } = phaseTableColumns(tableWidth, columns.length, compact, dense)
  // The title is the team and its phase, and nothing else: the button that
  // opened the sheet already said «Disponibilités».
  const teamName = getTeamName(team, clubs)
  const phaseLabel = entry?.label

  // The popover: which cell — the Renforts row's for a match, or a lent
  // player's — and where it sits. The container is measured at the same
  // moment, so the popover lands relative to it.
  const containerRef = useRef<View>(null)
  const [popover, setPopover] = useState<{
    gameId: string
    /** Set for a lent player's cell; absent for the Renforts row. */
    playerId?: string
    anchor: RenfortsAnchor | null
    frame: RenfortsAnchor | null
  } | null>(null)
  const openPopover = (gameId: string, playerId: string | undefined, anchor: RenfortsAnchor | null) => {
    const same = (p: { gameId: string; playerId?: string } | null) =>
      p?.gameId === gameId && p.playerId === playerId
    setPopover((prev) => ({ gameId, playerId, anchor, frame: same(prev) ? prev!.frame : null }))
    if (anchor) {
      containerRef.current?.measureInWindow?.((x, y, w, h) =>
        setPopover((prev) => (same(prev) ? { ...prev!, frame: { x, y, width: w, height: h } } : prev)),
      )
    }
  }
  const popoverIndex = popover ? columns.findIndex((c) => c.gameId === popover.gameId) : -1
  const lentTeam =
    popover?.playerId && popoverIndex >= 0
      ? grid.rows.find((r) => r.player.id === popover.playerId)?.cells[popoverIndex].lentTo
      : undefined
  // The key only when someone was lent: no loan, nothing to explain.
  const keyTeam = lentKeyTeam(grid)

  const title = onTeam ? (
    <TouchableOpacity
      testID="phase-panel-team"
      onPress={onTeam}
      accessibilityRole="link"
      accessibilityLabel={`Fiche de ${teamName}`}
      style={s.teamLink}
    >
      <Text style={s.title} numberOfLines={1}>{teamName}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  ) : (
    <Text style={s.title} numberOfLines={1}>{teamName}</Text>
  )

  return (
    <View
      ref={containerRef}
      testID={inline ? 'phase-panel' : undefined}
      style={inline ? s.inline : s.container}
      onLayout={inline ? (e) => setPaneWidth(e.nativeEvent.layout.width) : undefined}
    >
      <View style={[s.titleRow, dense && s.titleRowDense]}>
        {dense ? (
          // One line sideways: team, phase, and the frame's key beside them.
          <>
            <Text style={s.titleLine} numberOfLines={1}>
              <Text style={s.titleDense}>{teamName}</Text>
              {phaseLabel ? <Text style={s.subtitleInline}>{`  ${phaseLabel}`}</Text> : null}
            </Text>
            <CompositionKey />
            {keyTeam && <LentKey team={keyTeam} />}
          </>
        ) : (
          <View style={s.titleBlock}>
            {title}
            {phaseLabel ? <Text style={s.subtitle} numberOfLines={1}>{phaseLabel}</Text> : null}
            <View style={s.keyLine}>
              <CompositionKey />
              {keyTeam && <LentKey team={keyTeam} />}
            </View>
          </View>
        )}
        {onClose && (
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
        )}
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
        {inline && paneWidth === 0 ? null : grid.rows.length > 0 && columns.length > 0 ? (
          <PhaseAvailabilityTable
            grid={grid}
            columns={columns}
            width={tableWidth}
            compact={compact}
            dense={dense}
            required={required}
            unlicensed={unlicensed}
            onPlayer={onPlayer}
            onRenforts={(gameId, anchor) => openPopover(gameId, undefined, anchor)}
            onLent={(playerId, gameId, anchor) => openPopover(gameId, playerId, anchor)}
            onGame={onGame}
          />
        ) : (
          <Text style={s.empty}>
            {columns.length === 0 ? 'Aucun match sur cette phase.' : 'Aucun joueur dans cette équipe.'}
          </Text>
        )}
      </ScrollView>

      {popover && popoverIndex >= 0 && (
        <>
          <Pressable
            testID="phase-popover-backdrop"
            style={StyleSheet.absoluteFill}
            onPress={() => setPopover(null)}
          />
          {popover.playerId ? (
            lentTeam && (
              <LentPopover
                title={`En renfort · J${columns[popoverIndex].number}`}
                team={lentTeam}
                teamName={getTeamName(lentTeam, clubs)}
                placement={popoverPlacement(popover.anchor, popover.frame)}
              />
            )
          ) : (
            <RenfortsPopover
              title={`Renforts · J${columns[popoverIndex].number}`}
              renforts={grid.renforts[popoverIndex]}
              placement={popoverPlacement(popover.anchor, popover.frame)}
            />
          )}
        </>
      )}
    </View>
  )
}

/** A pane's margin around the planning — the reading screens' 16. */
const INLINE_PADDING = 16

export const POPOVER_WIDTH = 220
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

/**
 * The names behind a stack of faces. Nothing else: a borrowed player answers
 * for their own team's matches, not this one's — being on the line-up is the
 * whole fact, and the frame on the cell already said it.
 */
function RenfortsPopover({
  title,
  renforts,
  placement,
}: {
  title: string
  renforts: Player[]
  placement: ReturnType<typeof popoverPlacement>
}) {
  return (
    <View testID="renforts-popover" style={[s.popover, placement]}>
      <Text style={s.popoverTitle}>{title}</Text>
      {renforts.map((p) => (
        <View key={p.id} style={s.popoverRow}>
          <Avatar
            playerId={p.id}
            avatarUpdatedAt={p.avatarUpdatedAt}
            firstName={p.firstName}
            lastName={p.lastName}
            size={28}
          />
          <Text style={s.popoverName} numberOfLines={1}>
            {p.firstName} {p.lastName}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Which team of the club fields this player on that journée. */
function LentPopover({
  title,
  team,
  teamName,
  placement,
}: {
  title: string
  team: Team
  teamName: string
  placement: ReturnType<typeof popoverPlacement>
}) {
  return (
    <View testID="lent-popover" style={[s.popover, placement]}>
      <Text style={s.popoverTitle}>{title}</Text>
      <View style={s.popoverRow}>
        <TeamColorBadge color={team.color} number={team.number} size={28} />
        <Text style={s.popoverName} numberOfLines={1}>{teamName}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flexShrink: 1 },
  inline: { flex: 1, padding: INLINE_PADDING },
  teamLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  titleRowDense: { marginBottom: 6 },
  titleBlock: { flex: 1 },
  keyLine: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
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
