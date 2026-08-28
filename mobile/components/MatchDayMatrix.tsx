import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { AVAIL } from '@/constants/availability'
import { fonts } from '@/constants/typography'
import type { AvailabilityStatus, Game, MatchDay, Player, Team } from '@shared/types'

// ---------------------------------------------------------------------------
// La matrice des journées (#468)
//
// The grid the web has shown above `md:` since long before the app grew a
// tablet layout (`src/pages/admin/MatchDaysPage.tsx`): one section per team,
// lignes = les joueurs, colonnes = les prochaines journées, each journée being
// a Dispo cell and a Compo cell.
//
// It answers the one question the phone layout structurally cannot — «qui est
// dispo sur les trois prochaines journées» — because that screen shows one
// journée at a time, chosen with a stepper.
// ---------------------------------------------------------------------------

/**
 * Column widths, in points, taken from the web's `TABLE_COL_WIDTHS` so the two
 * grids are the same grid. They are minimums: see `matrixColumns`.
 */
export const MATRIX_COL = {
  joueur: 180,
  dispo: 64,
  joues: 64,
  brulage: 80,
  /** Each half of a journée's pair of columns. */
  day: 96,
} as const

/** The four columns that do not repeat. */
export const MATRIX_FIXED_WIDTH =
  MATRIX_COL.joueur + MATRIX_COL.dispo + MATRIX_COL.joues + MATRIX_COL.brulage

/** What one journée costs: its Dispo column and its Compo column. */
export const MATRIX_DAY_WIDTH = MATRIX_COL.day * 2

/** The web's own ceiling — `VISIBLE_MATCH_DAY_COUNT`. */
export const MAX_VISIBLE_MATCH_DAYS = 3

/**
 * The floor. Below two journées the grid stops being a grid — it says nothing
 * the single-journée cards did not, at the cost of a table to read.
 */
export const MIN_VISIBLE_MATCH_DAYS = 2

/**
 * How many journées fit in `available` points (#468).
 *
 * Three on any iPad held sideways, and on a 12.9" standing up. Two on an 11"
 * in portrait, where three would need 964pt against 802 available. The floor
 * of two can itself overflow — an iPad mini standing up is 60pt short — and
 * that is what the horizontal scroll is for, rather than a third layout.
 */
export function visibleMatchDayCount(available: number): number {
  const fits = Math.floor((available - MATRIX_FIXED_WIDTH) / MATRIX_DAY_WIDTH)
  return Math.max(MIN_VISIBLE_MATCH_DAYS, Math.min(MAX_VISIBLE_MATCH_DAYS, fits))
}

/**
 * The widths to lay the grid out with, for a given screen and journée count.
 *
 * The numbers above are a *floor*, not a width: the web's table is `w-full`
 * with 964pt as its `minWidth`, so spare room widens the columns instead of
 * leaving a band of nothing down the right-hand side. The journées take the
 * slack — that is where a roomier cell is worth something — and the last point
 * or two goes to the name, so the grid lands exactly on the screen's width.
 */
export function matrixColumns(available: number, count: number) {
  const day = Math.max(MATRIX_COL.day, Math.floor((available - MATRIX_FIXED_WIDTH) / (count * 2)))
  const used = MATRIX_FIXED_WIDTH + day * count * 2
  return {
    ...MATRIX_COL,
    joueur: MATRIX_COL.joueur + Math.max(0, available - used),
    day,
    /** The grid's own width — wider than `available` only when it overflows. */
    total: Math.max(used, available),
  }
}

/** One journée's column pair, and this team's fixture for it. */
export interface MatrixDay {
  /** The journée's number, as `J5`. */
  number: number
  /** The `MatchDay` row this team plays on — absent when the team is exempt. */
  matchDay?: MatchDay
  game?: Game
  /** Already formatted: «sam. 17 janv. · 16h00», or the week when unconfirmed. */
  dateLabel: string
  /** True when the date is the poule's week rather than a confirmed slot. */
  unconfirmed: boolean
  isHome: boolean
  opponentName: string
}

/** One row: a player of the team, and their answers across the journées. */
export interface MatrixRow {
  player: Player
  isCaptain: boolean
  points?: string
  /** Answered available, over the team's fixtures in the phase. */
  availableCount: number
  /** Fielded, over the same. */
  playedCount: number
  totalGames: number
  brulage?: { teamNumber: number; color?: string }
  cells: {
    status?: AvailabilityStatus
    canEdit: boolean
    /** The club team this player is fielded in for this journée, if any. */
    selectedTeam?: { number: number; color?: string }
    /** Whether the viewer may set that team — the line-up rule, not the
     *  availability one: the two differ, deliberately (#462). */
    canCompose: boolean
  }[]
}

export function MatchDayMatrix({
  team,
  teamName,
  divisionLabel,
  days,
  rows,
  columns,
  pager,
  onEditAvailability,
  onEditComposition,
  onOpenGame,
}: {
  team: Team
  teamName: string
  divisionLabel?: string
  days: MatrixDay[]
  rows: MatrixRow[]
  columns: ReturnType<typeof matrixColumns>
  /** Absent when the phase has no more journées than the grid shows. */
  pager?: { label: string; onPrev?: () => void; onNext?: () => void }
  onEditAvailability: (playerId: string, game: Game, dayIndex: number) => void
  /** Which of the club's teams this player turns out for that journée. */
  onEditComposition: (playerId: string, dayIndex: number) => void
  /** The journée header leads to the match itself. */
  onOpenGame: (game: Game) => void
}) {
  const c = columns

  return (
    <View style={s.section}>
      {/* Team header — the coloured edge, the name, and the pager */}
      <View style={[s.head, team.color ? { borderLeftColor: team.color } : null]}>
        <Text style={s.teamName} numberOfLines={1}>{teamName}</Text>
        {divisionLabel ? <Text style={s.division}>{divisionLabel}</Text> : null}
        {pager && (
          <View style={s.pager}>
            <TouchableOpacity
              style={[s.pagerBtn, !pager.onPrev && s.pagerBtnOff]}
              disabled={!pager.onPrev}
              onPress={pager.onPrev}
              accessibilityRole="button"
              accessibilityLabel="Journées précédentes"
            >
              <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={s.pagerLabel}>{pager.label}</Text>
            <TouchableOpacity
              style={[s.pagerBtn, !pager.onNext && s.pagerBtnOff]}
              disabled={!pager.onNext}
              onPress={pager.onNext}
              accessibilityRole="button"
              accessibilityLabel="Journées suivantes"
            >
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* The grid is only ever wider than the screen on the smallest slab held
          upright, where even two journées overflow by 60pt (#468). */}
      <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator>
        <View style={{ width: c.total }}>
          <View style={s.headerRow}>
            <Text style={[s.th, s.thLeft, { width: c.joueur }]}>Joueur</Text>
            <Text style={[s.th, { width: c.dispo }]}>Dispo</Text>
            <Text style={[s.th, { width: c.joues }]}>Joués</Text>
            <Text style={[s.th, { width: c.brulage }]}>Brûlage</Text>
            {days.map((d, i) => (
              <TouchableOpacity
                key={i}
                style={[s.dayHead, { width: c.day * 2 }]}
                disabled={!d.game}
                onPress={() => d.game && onOpenGame(d.game)}
                accessibilityRole={d.game ? 'button' : undefined}
              >
                <Text style={s.dayNumber}>J{d.number}</Text>
                <Text
                  style={[s.dayDate, d.unconfirmed && s.dayDateWarn]}
                  numberOfLines={1}
                >
                  {d.unconfirmed ? `⚠ ${d.dateLabel}` : d.dateLabel}
                </Text>
                {d.game ? (
                  <Text style={s.dayOpponent} numberOfLines={1}>
                    {d.isHome ? '⌂ ' : '↗ '}{d.opponentName}
                  </Text>
                ) : (
                  <Text style={s.dayExempt}>Exempt</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.subRow}>
            <View style={{ width: c.joueur + c.dispo + c.joues + c.brulage }} />
            {days.map((_, i) => (
              <View key={i} style={s.subPair}>
                <Text style={[s.subTh, { width: c.day }]}>Dispo</Text>
                <Text style={[s.subTh, { width: c.day }]}>Compo</Text>
              </View>
            ))}
          </View>

          {rows.map((row) => (
            <View key={row.player.id} style={s.row} testID={`matrix-row-${row.player.id}`}>
              <View style={[s.cell, { width: c.joueur }]}>
                <Text style={[s.name, row.isCaptain && s.nameCaptain]} numberOfLines={1}>
                  {row.player.firstName} {row.player.lastName}
                  {row.points ? <Text style={s.points}> ({row.points})</Text> : null}
                </Text>
                {row.player.licenseNumber ? (
                  <Text style={s.license}>{row.player.licenseNumber}</Text>
                ) : null}
              </View>
              <Text style={[s.count, { width: c.dispo }]}>
                {row.availableCount}/{row.totalGames}
              </Text>
              <Text style={[s.count, { width: c.joues }]}>
                {row.playedCount}/{row.totalGames}
              </Text>
              <View style={[s.cell, s.cellCentred, { width: c.brulage }]}>
                {row.brulage ? (
                  <View style={s.brulage}>
                    <View
                      style={[s.dot, { backgroundColor: row.brulage.color ?? colors.accent }]}
                    />
                    <Text style={s.brulageText}>Éq. {row.brulage.teamNumber}</Text>
                  </View>
                ) : (
                  <Text style={s.count}>—</Text>
                )}
              </View>

              {row.cells.map((cell, i) => {
                const day = days[i]
                const cfg = cell.status ? AVAIL[cell.status] : undefined
                const editable = cell.canEdit && !!day?.game
                const composable = cell.canCompose && !!day?.game
                return (
                  <View key={i} style={s.pair}>
                    <View style={[s.cell, s.cellCentred, { width: c.day }]}>
                      <TouchableOpacity
                        testID={`dispo-${row.player.id}-${i}`}
                        style={[
                          s.control,
                          cfg ? { borderColor: cfg.color, backgroundColor: cfg.bg } : null,
                          !editable && s.controlLocked,
                        ]}
                        disabled={!editable}
                        onPress={() => day?.game && onEditAvailability(row.player.id, day.game, i)}
                        accessibilityRole="button"
                        accessibilityLabel={`Disponibilité de ${row.player.firstName} ${row.player.lastName}, journée ${day?.number}`}
                      >
                        <Text
                          style={[s.controlText, cfg ? { color: cfg.color } : null]}
                          numberOfLines={1}
                        >
                          {cfg ? cfg.label : '—'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={[s.cell, s.cellCentred, { width: c.day }]}>
                      <TouchableOpacity
                        testID={`compo-${row.player.id}-${i}`}
                        style={[
                          s.control,
                          cell.selectedTeam
                            ? {
                                borderColor: cell.selectedTeam.color ?? colors.accent,
                                backgroundColor: colors.card,
                              }
                            : null,
                          !composable && s.controlLocked,
                        ]}
                        disabled={!composable}
                        onPress={() => onEditComposition(row.player.id, i)}
                        accessibilityRole="button"
                        accessibilityLabel={`Composition de ${row.player.firstName} ${row.player.lastName}, journée ${day?.number}`}
                      >
                        {cell.selectedTeam ? (
                          <>
                            <View
                              style={[
                                s.dot,
                                { backgroundColor: cell.selectedTeam.color ?? colors.accent },
                              ]}
                            />
                            <Text style={s.controlText} numberOfLines={1}>
                              Équipe {cell.selectedTeam.number}
                            </Text>
                          </>
                        ) : (
                          <Text style={[s.controlText, s.controlTextEmpty]}>—</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })}
            </View>
          ))}

          {rows.length === 0 && (
            <Text style={s.empty}>Aucun joueur dans cette équipe.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  teamName: { fontSize: 16, fontFamily: fonts.semiBold, color: colors.textPrimary },
  division: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pager: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  // 44pt targets below md: is the phone rule; on the slab this bar is a
  // pointer-sized control in a dense header, so 32 is the honest size.
  pagerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pagerBtnOff: { opacity: 0.35 },
  pagerLabel: { fontSize: 12, color: colors.textSecondary, fontVariant: ['tabular-nums'] },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  th: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  thLeft: { textAlign: 'left', paddingHorizontal: 12 },
  dayHead: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  dayNumber: { fontSize: 12, fontFamily: fonts.semiBold, color: colors.textPrimary },
  dayDate: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  dayDateWarn: { color: colors.warningText },
  dayOpponent: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  dayExempt: { fontSize: 10, color: colors.textSecondary, fontStyle: 'italic', marginTop: 1 },

  subRow: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subPair: { flexDirection: 'row', borderLeftWidth: 1, borderLeftColor: colors.border },
  subTh: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 3,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    // The project's tap target below md:. A row of controls has to clear it
    // however dense the grid gets.
    minHeight: 44,
  },
  cell: { justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 5 },
  cellCentred: { alignItems: 'center' },
  pair: { flexDirection: 'row', borderLeftWidth: 1, borderLeftColor: colors.border },

  name: { fontSize: 13, color: colors.textPrimary, paddingHorizontal: 4 },
  nameCaptain: { fontFamily: fonts.bold },
  points: { color: colors.textSecondary },
  license: { fontSize: 10, color: colors.textSecondary, paddingHorizontal: 4, marginTop: 1 },
  count: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
  },
  brulage: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  brulageText: { fontSize: 11, color: colors.textSecondary },
  dot: { width: 8, height: 8, borderRadius: 4 },

  // Fills its cell rather than its text, so a column of answers reads as one
  // width — «Oui», «Peut-être» and «—» line up (#468).
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 6,
  },
  controlLocked: { opacity: 0.5 },
  controlText: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.textSecondary },
  controlTextEmpty: { color: colors.textSecondary },

  empty: { fontSize: 13, color: colors.textSecondary, padding: 16 },
})
