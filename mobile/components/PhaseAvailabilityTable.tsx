import { useRef, type RefObject } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { colors } from '@/constants/colors'
import { AVAIL } from '@/constants/availability'
import { fonts } from '@/constants/typography'
import { LicenceTag } from '@/components/LicenceTag'
import { Avatar } from '@/components/Avatar'
import { TeamColorBadge } from '@/components/TeamColorBadge'
import Svg, { Line } from 'react-native-svg'
import {
  selectionVerdict,
  type PhaseAvailabilityColumn,
  type PhaseAvailabilityGrid,
  type PhaseAvailabilityRow,
} from '@shared/lib/phaseAvailability'
import type { AvailabilityStatus, Player, Team } from '@shared/types'

// ---------------------------------------------------------------------------
// Les disponibilités de toute la phase, pour une équipe (#623)
//
// Players down, the team's matches across, and two counts a captain asked for
// right after the name: «5/7» answered yes, «3/7» on a line-up. Name and
// counts are *frozen*: the journées scroll under them sideways, so whichever
// journée is on screen, the row still says whose it is.
//
// Under the players, two totals per journée: how many of the roster said yes,
// and how many the line-up names — the pair the journées matrix's Résumé gives.
// Renforts are one row, whoever and however many: per journée, the faces of
// the borrowed players its line-up names, their names a tap away.
//
// A phone held upright fits four or five journées; turned sideways, a phase of
// seven fits whole — but in ~400pt of height, which is what `dense` is for: a
// team of six plus both totals has to be in view without scrolling, or the
// totals are the part nobody sees.
// ---------------------------------------------------------------------------

/** Every height the table has, at its two densities. */
export function phaseTableMetrics(dense: boolean) {
  return dense
    ? { header: 32, row: 32, rowWithTags: 44, total: 28, cell: 24, count: 40 }
    : { header: 48, row: 48, rowWithTags: 48, total: 40, cell: 32, count: 48 }
}

/** «OUI» needs this much, and it is what a portrait phone scrolls at. */
export const MIN_DAY_WIDTH = 44

/**
 * The widths for a given screen: the name column narrows on a phone, and the
 * journées share whatever is left — never below `MIN_DAY_WIDTH`, which is
 * where the horizontal scroll takes over. `overflows` is what the screen reads
 * to suggest turning the phone.
 */
export function phaseTableColumns(available: number, count: number, compact: boolean, dense = false) {
  const name = compact ? 108 : 200
  const counts = phaseTableMetrics(dense).count * 2
  const room = available - name - counts
  const day = count > 0 ? Math.max(MIN_DAY_WIDTH, Math.floor(room / count)) : MIN_DAY_WIDTH
  return { name, counts, day, overflows: day * count > room }
}

/** «B. Dangelser» where the column is narrow — the surname is the one that tells two apart. */
export function shortName(p: Pick<Player, 'firstName' | 'lastName'>, compact: boolean): string {
  if (!compact) return `${p.firstName} ${p.lastName}`
  const initial = p.firstName.trim().charAt(0)
  return initial ? `${initial}. ${p.lastName}` : p.lastName
}

export function PhaseAvailabilityTable({
  grid,
  columns,
  width,
  compact,
  dense = false,
  required,
  unlicensed,
  onPlayer,
  onGame,
  onRenforts,
  onLent,
}: {
  grid: PhaseAvailabilityGrid
  columns: PhaseAvailabilityColumn[]
  /** The width the table may take. */
  width: number
  compact: boolean
  /** A phone on its side: every row as short as it reads (see above). */
  dense?: boolean
  /** Players the division fields per match — the bar both totals are read against. */
  required: number
  unlicensed: Set<string>
  onPlayer: (playerId: string) => void
  onGame: (gameId: string) => void
  /** A Renforts cell was tapped; `anchor` is where it sits on screen, when known. */
  onRenforts?: (gameId: string, anchor: RenfortsAnchor | null) => void
  /** A cell of a player lent to another team was tapped. */
  onLent?: (playerId: string, gameId: string, anchor: RenfortsAnchor | null) => void
}) {
  const m = phaseTableMetrics(dense)
  const cols = phaseTableColumns(width, columns.length, compact, dense)
  const countWidth = m.count
  const hasRenforts = grid.renfortGames > 0
  const total = columns.length

  // «Renfort» rides in the Oui column instead (below), so only the licence
  // badge ever needs a second line.
  const hasTags = (row: PhaseAvailabilityRow) => unlicensed.has(row.player.id)
  // One height per row, read by both halves of the table — they are two
  // views, and a row of one must stay level with its row in the other.
  const rowHeight = (row: PhaseAvailabilityRow) => (hasTags(row) ? m.rowWithTags : m.row)

  return (
    <View style={s.table} testID="phase-availability-table">
      {/* Frozen: the name and the two counts. */}
      <View style={s.frozen}>
        <View style={[s.headerRow, { height: m.header }]}>
          <Text style={[s.headerText, { width: cols.name, paddingLeft: 12 }]}>Joueur</Text>
          <Text style={[s.headerText, s.center, { width: countWidth }]}>Oui</Text>
          <Text style={[s.headerText, s.center, { width: countWidth }]}>Sél.</Text>
        </View>
        {grid.rows.map((row) => (
          <TouchableOpacity
            key={row.player.id}
            testID={`phase-row-${row.player.id}`}
            style={[s.row, { height: rowHeight(row) }]}
            onPress={() => onPlayer(row.player.id)}
            accessibilityRole="button"
            accessibilityLabel={
              `${row.player.firstName} ${row.player.lastName}, ` +
              `disponible ${row.available} sur ${total}, sélectionné ${row.selected} sur ${total}`
            }
          >
            <View style={[s.nameCell, { width: cols.name }]}>
              <Text style={[s.name, dense && s.nameDense]} numberOfLines={1}>
                {shortName(row.player, compact)}
              </Text>
              {hasTags(row) && <LicenceTag />}
            </View>
            <Text style={[s.count, dense && s.countDense, { width: countWidth }]}>
              {row.available}/{total}
            </Text>
            <Text style={[s.count, s.countSecondary, dense && s.countDense, { width: countWidth }]}>
              {row.selected}/{total}
            </Text>
          </TouchableOpacity>
        ))}
        {hasRenforts && (
          <View style={[s.row, { height: m.row }]} testID="phase-renforts-row">
            <Text style={[s.renfortsLabel, dense && s.nameDense, { width: cols.name }]} numberOfLines={1}>
              Renforts
            </Text>
            {/* No «Oui» total: how much of this team's phase a borrowed player
                could play is nobody's question. */}
            <View style={{ width: countWidth }} />
            <Text style={[s.count, s.countSecondary, dense && s.countDense, { width: countWidth }]}>
              {grid.renfortGames}/{total}
            </Text>
          </View>
        )}
        <View style={[s.totalRow, { height: m.total }]}>
          <Text style={[s.totalLabel, { width: cols.name + countWidth * 2 }]} numberOfLines={1}>
            Disponibles
          </Text>
        </View>
        <View style={[s.totalRow, { height: m.total }]}>
          <Text style={[s.totalLabel, { width: cols.name + countWidth * 2 }]} numberOfLines={1}>
            Sélectionnés
          </Text>
        </View>
      </View>

      {/* Scrolling: the journées. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={cols.overflows} bounces={false}>
        <View>
          <View style={[s.headerRow, { height: m.header }]}>
            {columns.map((c) => (
              <TouchableOpacity
                key={c.gameId}
                testID={`phase-col-${c.gameId}`}
                style={[s.dayHeader, { width: cols.day, height: m.header }]}
                onPress={() => onGame(c.gameId)}
                accessibilityRole="button"
                accessibilityLabel={`Journée ${c.number}, le ${c.date}`}
              >
                <Text style={[s.dayNumber, dense && s.dayNumberDense]}>J{c.number}</Text>
                <Text style={[s.dayDate, dense && s.dayDateDense]}>{c.date}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {grid.rows.map((row) => (
            <View key={row.player.id} style={[s.row, { height: rowHeight(row) }]}>
              {row.cells.map((cell) => {
                const a = cell.status ? AVAIL[cell.status] : undefined
                if (cell.lentTo) {
                  return (
                    <View key={cell.gameId} style={[s.cellWrap, { width: cols.day }]}>
                      <LentCell
                        testID={`phase-cell-${row.player.id}-${cell.gameId}`}
                        team={cell.lentTo}
                        status={cell.status}
                        selected={cell.selected}
                        height={m.cell}
                        onPress={onLent && ((anchor) => onLent(row.player.id, cell.gameId, anchor))}
                      />
                    </View>
                  )
                }
                return (
                  <View key={cell.gameId} style={[s.cellWrap, { width: cols.day }]}>
                    <View
                      testID={`phase-cell-${row.player.id}-${cell.gameId}`}
                      style={[
                        s.cell,
                        { height: m.cell },
                        a ? { backgroundColor: a.bg } : s.cellEmpty,
                        cell.selected && s.cellSelected,
                      ]}
                      accessibilityLabel={
                        (a ? a.label : 'Sans réponse') + (cell.selected ? ', dans la composition' : '')
                      }
                    >
                      {/* No answer is an empty box: a dash said nothing more. */}
                      {a && <Text style={[s.cellText, { color: a.color }]}>{a.short}</Text>}
                    </View>
                  </View>
                )
              })}
            </View>
          ))}
          {hasRenforts && (
            <View style={[s.row, { height: m.row }]}>
              {grid.renforts.map((list, i) => (
                <View key={columns[i]?.gameId ?? i} style={[s.cellWrap, { width: cols.day }]}>
                  {list.length > 0 && (
                    <RenfortsCell
                      gameId={columns[i].gameId}
                      renforts={list}
                      height={m.cell}
                      onPress={onRenforts}
                    />
                  )}
                </View>
              ))}
            </View>
          )}
          <View style={[s.totalRow, { height: m.total }]}>
            {grid.availableByGame.map((n, i) => (
              <View key={columns[i]?.gameId ?? i} style={[s.cellWrap, { width: cols.day }]}>
                <Text
                  testID={`phase-available-${columns[i]?.gameId}`}
                  style={[
                    s.totalCount,
                    { color: n >= required ? AVAIL.available.color : AVAIL.unavailable.color },
                  ]}
                >
                  {n}
                </Text>
              </View>
            ))}
          </View>
          <View style={[s.totalRow, { height: m.total }]}>
            {grid.selectedByGame.map((n, i) => {
              const verdict = selectionVerdict(n, required)
              return (
                <View key={columns[i]?.gameId ?? i} style={[s.cellWrap, { width: cols.day }]}>
                  <Text
                    testID={`phase-selected-${columns[i]?.gameId}`}
                    style={[
                      s.totalCount,
                      {
                        color:
                          verdict === 'ok'
                            ? AVAIL.available.color
                            : verdict === 'off'
                              ? AVAIL.unavailable.color
                              : colors.tabInactive,
                      },
                    ]}
                  >
                    {n}/{required}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

/** Where a Renforts cell sits in the window, for the popover to point at. */
export interface RenfortsAnchor {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Translucent slate: it has to read over the grey of no answer *and* over the
 * green, amber and red of one, since a lent player keeps their answer's tint.
 */
const HATCH_COLOR = 'rgba(15, 23, 42, 0.32)'

/** Past this many, the stack says «+N» rather than growing past its column. */
const STACKED_AVATARS = 2

/**
 * One match's renforts as a stack of faces — who, at a glance, in the width of
 * a cell. The names are a tap away (the popover), not printed: a column is
 * 44pt on a phone held upright.
 */
function RenfortsCell({
  gameId,
  renforts,
  height,
  onPress,
}: {
  gameId: string
  renforts: Player[]
  /** The cell's own height: the stack sits inside the same frame as any cell. */
  height: number
  onPress?: (gameId: string, anchor: RenfortsAnchor | null) => void
}) {
  const ref = useRef<View>(null)
  const shown = renforts.slice(0, STACKED_AVATARS)
  const more = renforts.length - shown.length
  const names = renforts.map((p) => `${p.firstName} ${p.lastName}`).join(', ')
  // Inside the frame, with a point of air above and below.
  const size = height - 6

  return (
    <TouchableOpacity
      ref={ref}
      testID={`phase-renforts-${gameId}`}
      // Framed like any cell of the line-up: a renfort is only listed because
      // the line-up names them.
      style={[s.cell, s.cellEmpty, s.cellSelected, s.renfortsCell, { height }]}
      hitSlop={6}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Renforts : ${names}`}
      onPress={() => onPress && pressWithAnchor(ref, (anchor) => onPress(gameId, anchor))}
    >
      {shown.map((p, i) => (
        <Avatar
          key={p.id}
          playerId={p.id}
          avatarUpdatedAt={p.avatarUpdatedAt}
          firstName={p.firstName}
          lastName={p.lastName}
          size={size}
          style={[s.avatarRing, i > 0 && { marginLeft: -size / 3 }]}
        />
      ))}
      {more > 0 && <Text style={s.renfortsMore}>+{more}</Text>}
    </TouchableOpacity>
  )
}

/**
 * Opened at once, placed when the measure lands: a popover that waited on
 * layout would be a tap that does nothing for a frame.
 */
function pressWithAnchor(ref: RefObject<View | null>, open: (anchor: RenfortsAnchor | null) => void) {
  open(null)
  ref.current?.measureInWindow?.((x, y, w, h) => open({ x, y, width: w, height: h }))
}

/** Stripe spacing and reach, in points: wider than any cell, taller than any. */
const HATCH_STEP = 7
const HATCH_SPAN = 240
const HATCH_RISE = 48
const HATCH_LINES = Array.from(
  { length: Math.ceil((HATCH_SPAN + HATCH_RISE) / HATCH_STEP) },
  (_, i) => i * HATCH_STEP - HATCH_RISE,
)

/**
 * Diagonal stripes across whatever box holds it — «not here, elsewhere».
 *
 * Real lines, not an SVG `Pattern`: a 6pt tile turned 45° came out on a
 * device as a sparse field of dots, the hatching nobody could see. Lines in
 * user space, clipped by the Svg's own box, are the same stripes at any size.
 */
function Hatch() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      {HATCH_LINES.map((x) => (
        <Line
          key={x}
          x1={x}
          y1={HATCH_RISE}
          x2={x + HATCH_RISE}
          y2={0}
          stroke={HATCH_COLOR}
          strokeWidth={2}
        />
      ))}
    </Svg>
  )
}

/**
 * A roster player another team of the club fields on this journée (#623):
 * hatched, because they are not available to this team whatever they
 * answered, with that team's badge — its number in its colour, the way the
 * app shows a team everywhere — so which team reads without a tap. The tap
 * names it. The answer's tint stays under the hatching: a «oui» lent away is
 * still the player having said yes.
 */
function LentCell({
  testID,
  team,
  status,
  selected,
  height,
  onPress,
}: {
  testID: string
  team: Team
  status?: AvailabilityStatus
  /** Also on this line-up — a contradiction, and the frame keeps saying so. */
  selected: boolean
  height: number
  onPress?: (anchor: RenfortsAnchor | null) => void
}) {
  const ref = useRef<View>(null)
  const a = status ? AVAIL[status] : undefined
  return (
    <TouchableOpacity
      ref={ref}
      testID={testID}
      style={[
        s.cell,
        a ? { backgroundColor: a.bg } : s.cellEmpty,
        s.lentCell,
        { height },
        selected && s.cellSelected,
      ]}
      hitSlop={6}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={
        `En renfort en équipe ${team.number}` +
        (a ? `, ${a.label}` : '') +
        (selected ? ', dans la composition' : '')
      }
      onPress={() => onPress && pressWithAnchor(ref, onPress)}
    >
      <Hatch />
      {/* Two points of air, and a number as big as the badge allows: it is
          the one thing in the cell to read. */}
      <TeamColorBadge
        color={team.color}
        number={team.number}
        size={height - 4}
        fontSize={Math.round((height - 4) * 0.6)}
      />
    </TouchableOpacity>
  )
}

/**
 * The hatching's key, beside the frame's — only when someone was lent, and
 * wearing the badge of a team they went to (`lentKeyTeam`), so the key looks
 * like the cells it explains.
 */
export function LentKey({ team }: { team: Pick<Team, 'number' | 'color'> }) {
  return (
    <View style={s.key} testID="phase-lent-key">
      <View style={[s.keySwatch, s.cellEmpty, s.lentCell, s.keySwatchCentred]}>
        <Hatch />
        <TeamColorBadge color={team.color} number={team.number} size={14} fontSize={9} />
      </View>
      <Text style={s.keyText} numberOfLines={1}>En renfort</Text>
    </View>
  )
}

/**
 * What a frame means — the one key this grid needs. OUI / PE / NON are the
 * app's own answers, read the same way on every screen; the frame is this
 * grid's alone. It rides in the sheet's title line, not in a legend row.
 */
export function CompositionKey() {
  return (
    <View style={s.key} testID="phase-composition-key">
      <View style={[s.keySwatch, s.cellEmpty, s.cellSelected]} />
      <Text style={s.keyText} numberOfLines={1}>Dans la composition</Text>
    </View>
  )
}

const s = StyleSheet.create({
  table: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  // The rule the web draws after the counts: what is right of it scrolls.
  frozen: { borderRightWidth: 1, borderRightColor: colors.border },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  headerText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  center: { textAlign: 'center' },
  dayHeader: { alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.textPrimary },
  dayNumberDense: { fontSize: 12, lineHeight: 14 },
  dayDate: { fontSize: 11, color: colors.textSecondary },
  dayDateDense: { fontSize: 10, lineHeight: 12 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  nameCell: { paddingLeft: 12, paddingRight: 4, justifyContent: 'center', gap: 2 },
  name: { fontSize: 14, color: colors.textPrimary },
  nameDense: { fontSize: 13 },
  renfortsLabel: {
    paddingLeft: 12,
    paddingRight: 4,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
  renfortsCell: { flexDirection: 'row' },
  lentCell: { overflow: 'hidden' },
  // The cell's own grey, so overlapping faces read as two.
  avatarRing: { borderWidth: 1.5, borderColor: colors.bg },
  renfortsMore: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.textSecondary, marginLeft: 3 },
  count: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary, textAlign: 'center' },
  // Played-for is the second question; the one asked for is availability.
  countSecondary: { color: colors.textSecondary },
  countDense: { fontSize: 13 },

  cellWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  cell: {
    alignSelf: 'stretch',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellEmpty: { backgroundColor: colors.bg },
  // The frame says «on the line-up»: dark, so it reads over all three tints.
  cellSelected: { borderWidth: 2, borderColor: colors.textPrimary },
  cellText: { fontSize: 11, fontFamily: fonts.semiBold },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: {
    paddingLeft: 12,
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalCount: { fontSize: 13, fontFamily: fonts.semiBold },

  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keySwatch: { width: 22, height: 16, borderRadius: 4 },
  keySwatchCentred: { alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 12, color: colors.textSecondary },
})
