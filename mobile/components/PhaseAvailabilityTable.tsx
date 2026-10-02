import { useRef } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { colors } from '@/constants/colors'
import { AVAIL } from '@/constants/availability'
import { fonts } from '@/constants/typography'
import { LicenceTag } from '@/components/LicenceTag'
import { Avatar } from '@/components/Avatar'
import {
  selectionVerdict,
  type PhaseAvailabilityColumn,
  type PhaseAvailabilityGrid,
  type PhaseAvailabilityRow,
  type PhaseRenfort,
} from '@shared/lib/phaseAvailability'
import type { Player } from '@shared/types'

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
                      <Text style={[s.cellText, { color: a ? a.color : colors.tabInactive }]}>
                        {a ? a.short : '—'}
                      </Text>
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
                      size={m.cell - 2}
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
  size,
  onPress,
}: {
  gameId: string
  renforts: PhaseRenfort[]
  size: number
  onPress?: (gameId: string, anchor: RenfortsAnchor | null) => void
}) {
  const ref = useRef<View>(null)
  const shown = renforts.slice(0, STACKED_AVATARS)
  const more = renforts.length - shown.length
  const names = renforts.map((r) => `${r.player.firstName} ${r.player.lastName}`).join(', ')

  return (
    <TouchableOpacity
      ref={ref}
      testID={`phase-renforts-${gameId}`}
      style={s.renfortsCell}
      hitSlop={6}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Renforts : ${names}`}
      onPress={() => {
        const node = ref.current
        // Opened at once, placed when the measure lands: a popover that waited
        // on layout would be a tap that does nothing for a frame.
        onPress?.(gameId, null)
        node?.measureInWindow?.((x, y, width, height) => onPress?.(gameId, { x, y, width, height }))
      }}
    >
      {shown.map((r, i) => (
        <Avatar
          key={r.player.id}
          playerId={r.player.id}
          avatarUpdatedAt={r.player.avatarUpdatedAt}
          firstName={r.player.firstName}
          lastName={r.player.lastName}
          size={size}
          style={[s.avatarRing, i > 0 && { marginLeft: -size / 3 }]}
        />
      ))}
      {more > 0 && <Text style={s.renfortsMore}>+{more}</Text>}
    </TouchableOpacity>
  )
}

/** The three answers, and what a frame means — under the table, once. */
export function PhaseAvailabilityLegend() {
  return (
    <View style={s.legend}>
      {(['available', 'maybe', 'unavailable'] as const).map((k) => (
        <View key={k} style={s.legendItem}>
          <View style={[s.legendSwatch, { backgroundColor: AVAIL[k].bg }]}>
            <Text style={[s.legendShort, { color: AVAIL[k].color }]}>{AVAIL[k].short}</Text>
          </View>
          <Text style={s.legendText}>{AVAIL[k].label}</Text>
        </View>
      ))}
      <View style={s.legendItem}>
        <View style={[s.legendSwatch, s.cellEmpty, s.cellSelected]} />
        <Text style={s.legendText}>Dans la composition</Text>
      </View>
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
  renfortsCell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 28 },
  avatarRing: { borderWidth: 1.5, borderColor: colors.card },
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

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: {
    minWidth: 34,
    height: 22,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  legendShort: { fontSize: 10, fontFamily: fonts.semiBold },
  legendText: { fontSize: 12, color: colors.textSecondary },
})
