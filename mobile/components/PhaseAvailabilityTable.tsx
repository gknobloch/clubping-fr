import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { colors } from '@/constants/colors'
import { AVAIL } from '@/constants/availability'
import { fonts } from '@/constants/typography'
import { LicenceTag } from '@/components/LicenceTag'
import type { PhaseAvailabilityColumn, PhaseAvailabilityGrid } from '@shared/lib/phaseAvailability'
import type { Player } from '@shared/types'

// ---------------------------------------------------------------------------
// Les disponibilités de toute la phase, pour une équipe (#623)
//
// Players down, the team's matches across, and the ratio a captain asked for
// («5/7») right after the name. Name and ratio are *frozen*: the journées
// scroll under them sideways, so whichever journée is on screen, the row still
// says whose it is and how much of the phase they can play.
//
// A phone held upright fits four or five journées; turned sideways, a phase of
// seven fits whole. The screen says so rather than locking an orientation — the
// rest of the app reads standing up, and the grid is only one screen of it.
// ---------------------------------------------------------------------------

export const ROW_HEIGHT = 48
const HEADER_HEIGHT = 48
const RATIO_WIDTH = 52
/** A cell is a tap target in nothing, but 44 keeps «OUI» from crowding. */
export const MIN_DAY_WIDTH = 44

/**
 * The widths for a given screen: the name column narrows on a phone, and the
 * journées share whatever is left — never below `MIN_DAY_WIDTH`, which is
 * where the horizontal scroll takes over. `overflows` is what the screen reads
 * to suggest turning the phone.
 */
export function phaseTableColumns(available: number, count: number, compact: boolean) {
  const name = compact ? 116 : 200
  const room = available - name - RATIO_WIDTH
  const day = count > 0 ? Math.max(MIN_DAY_WIDTH, Math.floor(room / count)) : MIN_DAY_WIDTH
  return { name, day, overflows: day * count > room }
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
  required,
  unlicensed,
  onPlayer,
  onGame,
}: {
  grid: PhaseAvailabilityGrid
  columns: PhaseAvailabilityColumn[]
  /** The width the table may take. */
  width: number
  compact: boolean
  /** Players the division fields per match — the bar the «Oui» count is read against. */
  required: number
  unlicensed: Set<string>
  onPlayer: (playerId: string) => void
  onGame: (gameId: string) => void
}) {
  const cols = phaseTableColumns(width, columns.length, compact)
  const total = columns.length

  return (
    <View style={s.table} testID="phase-availability-table">
      {/* Frozen: name and ratio. */}
      <View style={s.frozen}>
        <View style={[s.headerRow, { height: HEADER_HEIGHT }]}>
          <Text style={[s.headerText, { width: cols.name, paddingLeft: 12 }]}>Joueur</Text>
          <Text style={[s.headerText, s.center, { width: RATIO_WIDTH }]}>Oui</Text>
        </View>
        {grid.rows.map((row) => (
          <TouchableOpacity
            key={row.player.id}
            testID={`phase-row-${row.player.id}`}
            style={s.row}
            onPress={() => onPlayer(row.player.id)}
            accessibilityRole="button"
            accessibilityLabel={`${row.player.firstName} ${row.player.lastName}, disponible ${row.available} sur ${total}`}
          >
            <View style={[s.nameCell, { width: cols.name }]}>
              <Text style={s.name} numberOfLines={1}>{shortName(row.player, compact)}</Text>
              {(row.renfort || unlicensed.has(row.player.id)) && (
                <View style={s.nameTags}>
                  {row.renfort && <Text style={s.renfort}>Renfort</Text>}
                  {unlicensed.has(row.player.id) && <LicenceTag />}
                </View>
              )}
            </View>
            <Text style={[s.ratio, { width: RATIO_WIDTH }]}>{row.available}/{total}</Text>
          </TouchableOpacity>
        ))}
        <View style={[s.footerRow]}>
          <Text style={[s.footerLabel, { width: cols.name + RATIO_WIDTH }]} numberOfLines={1}>
            Disponibles
          </Text>
        </View>
      </View>

      {/* Scrolling: the journées. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={cols.overflows} bounces={false}>
        <View>
          <View style={[s.headerRow, { height: HEADER_HEIGHT }]}>
            {columns.map((c) => (
              <TouchableOpacity
                key={c.gameId}
                testID={`phase-col-${c.gameId}`}
                style={[s.dayHeader, { width: cols.day }]}
                onPress={() => onGame(c.gameId)}
                accessibilityRole="button"
                accessibilityLabel={`Journée ${c.number}, le ${c.date}`}
              >
                <Text style={s.dayNumber}>J{c.number}</Text>
                <Text style={s.dayDate}>{c.date}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {grid.rows.map((row) => (
            <View key={row.player.id} style={s.row}>
              {row.cells.map((cell) => {
                const a = cell.status ? AVAIL[cell.status] : undefined
                return (
                  <View key={cell.gameId} style={[s.cellWrap, { width: cols.day }]}>
                    <View
                      testID={`phase-cell-${row.player.id}-${cell.gameId}`}
                      style={[
                        s.cell,
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
          <View style={s.footerRow}>
            {grid.availableByGame.map((n, i) => {
              const ok = n >= required
              return (
                <View key={columns[i]?.gameId ?? i} style={[s.cellWrap, { width: cols.day }]}>
                  <Text
                    style={[
                      s.footerCount,
                      { color: ok ? AVAIL.available.color : AVAIL.unavailable.color },
                    ]}
                  >
                    {n}
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

/** The three answers, and what a frame means — above the table, once. */
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
  // The rule the web draws after the ratio: what is left of it scrolls.
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
  dayHeader: { height: HEADER_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.textPrimary },
  dayDate: { fontSize: 11, color: colors.textSecondary },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  nameCell: { paddingLeft: 12, paddingRight: 4, justifyContent: 'center', gap: 2 },
  name: { fontSize: 14, color: colors.textPrimary },
  nameTags: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  renfort: { fontSize: 10, fontFamily: fonts.medium, color: colors.textSecondary },
  ratio: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary, textAlign: 'center' },

  cellWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  cell: {
    alignSelf: 'stretch',
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellEmpty: { backgroundColor: colors.bg },
  // The frame says «on the line-up»: dark, so it reads over all three tints.
  cellSelected: { borderWidth: 2, borderColor: colors.textPrimary },
  cellText: { fontSize: 11, fontFamily: fonts.semiBold },

  footerRow: { flexDirection: 'row', alignItems: 'center', height: 40, backgroundColor: colors.bg },
  footerLabel: {
    paddingLeft: 12,
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footerCount: { fontSize: 14, fontFamily: fonts.semiBold },

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
