import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
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
//
// The same grid draws «Autres joueurs du club» (#476), the web's last section:
// no `team`, so no colour, no fixtures and no counts — the club's players who
// are in no roster, and the one column that has something to say about them,
// which team they turn out for.
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

/**
 * What the Résumé row states for one journée (#580): how many of the roster
 * answered available, how many the line-up names, and how many the division
 * requires.
 *
 * `selected` counts the **line-up**, never the rows of this section. A player
 * fielded from «Autres joueurs du club» is on the line-up and in no section
 * above it — which is exactly how a compo reaches 5 for a 4-player division
 * without any of the four rows showing it.
 */
export interface MatrixTotals {
  available: number
  selected: number
  required: number
}

/**
 * The Résumé row's two verdicts, and they are not the same shape.
 *
 * Availability is a floor: more than enough is fine, and a club with nine
 * willing players has not done anything wrong. A line-up is an exact count —
 * the feuille de match has `required` places and no more — so `===` is what
 * turns 5/4 red as well as 3/4. The web's footer has always read this way
 * (`src/pages/admin/MatchDaysPage.tsx`); the asymmetry is the whole of #580,
 * so it is pinned here rather than written inline twice.
 */
export function summaryVerdict(totals: MatrixTotals): {
  availableOk: boolean
  selectedOk: boolean
} {
  return {
    availableOk: totals.available >= totals.required,
    selectedOk: totals.selected === totals.required,
  }
}

/**
 * The Résumé row's two tints: deliberately the green and red of the Dispo
 * answers directly above it rather than a pair of its own. The row states a
 * verdict about the columns it sits under, and a second green on the same grid
 * would read as a second meaning.
 */
const VERDICT = {
  ok: { bg: AVAIL.available.bg, text: AVAIL.available.color },
  off: { bg: AVAIL.unavailable.bg, text: AVAIL.unavailable.color },
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
  /**
   * The Résumé row's counts (#580). Absent in a section with no team, and
   * absent when the team sits the round out: there is no fixture to be short
   * of, which is the «—» the web prints in the same two cells.
   */
  totals?: MatrixTotals
}

/** One row: a player of the team, and their answers across the journées. */
export interface MatrixRow {
  player: Player
  isCaptain: boolean
  points?: string
  /** The FFTT has not listed a licence for them this season (#488). */
  unlicensed?: boolean
  /** Answered available, over the team's fixtures in the phase. Ignored in a
   *  section with no team: there are no fixtures of theirs to count. */
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
  title,
  subtitle,
  divisionLabel,
  search,
  days,
  rows,
  columns,
  pager,
  onEditAvailability,
  onEditComposition,
  onOpenGame,
  onOpenPlayer,
  onOpenTeam,
}: {
  /**
   * Absent for «Autres joueurs du club» (#476): those players are in no
   * roster, so the section has no colour, no fixture of its own, and nothing
   * to count — only the Compo column says anything about them.
   */
  team?: Team
  title: string
  subtitle?: string
  divisionLabel?: string
  /** The name filter, given only once the list is long enough to need it. */
  search?: { value: string; onChange: (value: string) => void }
  days: MatrixDay[]
  rows: MatrixRow[]
  columns: ReturnType<typeof matrixColumns>
  /** Absent when the phase has no more journées than the grid shows. */
  pager?: { label: string; onPrev?: () => void; onNext?: () => void }
  /** Only ever called from a roster section: see `team`. */
  onEditAvailability?: (playerId: string, game: Game, dayIndex: number) => void
  /** Which of the club's teams this player turns out for that journée. */
  onEditComposition: (playerId: string, dayIndex: number) => void
  /** The journée header leads to the match itself, where there is one. */
  onOpenGame?: (game: Game) => void
  /**
   * A name leads to the player (#581), as a name does everywhere else in the
   * app. Given in every section, «Autres joueurs du club» included: those are
   * licensees of the club like any other, and the column beside them is about
   * fielding them.
   */
  onOpenPlayer?: (playerId: string) => void
  /**
   * The section's title leads to the team's fiche (#581) — absent in a section
   * with no team, which has no fiche to lead to.
   */
  onOpenTeam?: () => void
}) {
  const c = columns
  /** A roster section counts and answers; the club's leftovers do neither. */
  const isTeamSection = !!team

  return (
    <View style={s.section}>
      {/* Section header — the coloured edge, the name, and the pager */}
      <View style={[s.head, team?.color ? { borderLeftColor: team.color } : null]}>
        {/* Only the title is the target, not the whole header: the pager's
            chevrons live in this row, and a press area wrapping them would
            swallow the taps that page the journées. */}
        <TouchableOpacity
          style={s.heading}
          testID="matrix-open-team"
          disabled={!onOpenTeam}
          onPress={onOpenTeam}
          accessibilityRole={onOpenTeam ? 'button' : undefined}
          accessibilityLabel={onOpenTeam ? `Fiche de ${title}` : undefined}
        >
          <Text style={s.teamName} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </TouchableOpacity>
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

      {/* The club minus the rosters is the longest list on the screen, so it
          gets the web's name filter once it is long enough to need it (#454). */}
      {search && (
        <View style={s.searchBar}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            testID="matrix-search"
            style={s.searchInput}
            value={search.value}
            onChangeText={search.onChange}
            placeholder="Rechercher un joueur"
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            accessibilityLabel="Rechercher un joueur"
          />
        </View>
      )}

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
                onPress={() => d.game && onOpenGame?.(d.game)}
                accessibilityRole={d.game ? 'button' : undefined}
              >
                <Text style={s.dayNumber}>J{d.number}</Text>
                <Text
                  style={[s.dayDate, d.unconfirmed && s.dayDateWarn]}
                  numberOfLines={1}
                >
                  {d.unconfirmed ? `⚠ ${d.dateLabel}` : d.dateLabel}
                </Text>
                {!isTeamSection ? null : d.game ? (
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
              <TouchableOpacity
                style={[s.cell, { width: c.joueur }]}
                testID={`open-player-${row.player.id}`}
                disabled={!onOpenPlayer}
                onPress={() => onOpenPlayer?.(row.player.id)}
                accessibilityRole={onOpenPlayer ? 'button' : undefined}
                accessibilityLabel={
                  onOpenPlayer
                    ? `${row.player.firstName} ${row.player.lastName}`
                    : undefined
                }
              >
                <Text style={[s.name, row.isCaptain && s.nameCaptain]} numberOfLines={1}>
                  {row.player.firstName} {row.player.lastName}
                  {row.points ? <Text style={s.points}> ({row.points})</Text> : null}
                </Text>
                {/* The marker goes on the licence line — that line is already
                    about the licence, and the name column cannot widen (#488). */}
                {(row.player.licenseNumber || row.unlicensed) ? (
                  <Text style={s.license} numberOfLines={1}>
                    {row.player.licenseNumber}
                    {row.unlicensed ? (
                      <Text style={s.unlicensed}>
                        {row.player.licenseNumber ? ' ' : ''}Sans licence
                      </Text>
                    ) : null}
                  </Text>
                ) : null}
              </TouchableOpacity>
              <Text style={[s.count, { width: c.dispo }]}>
                {isTeamSection ? `${row.availableCount}/${row.totalGames}` : '—'}
              </Text>
              <Text style={[s.count, { width: c.joues }]}>
                {isTeamSection ? `${row.playedCount}/${row.totalGames}` : '—'}
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
                // A club section has no fixture of its own — the round is what
                // it composes for, and `canCompose` already asked whether any
                // of the club's teams plays it.
                const composable = cell.canCompose && (!isTeamSection || !!day?.game)
                return (
                  <View key={i} style={s.pair}>
                    <View style={[s.cell, s.cellCentred, { width: c.day }]}>
                      {/* Nobody is available for a match their club has not
                          picked them for: the club section leaves the column
                          empty rather than offering an answer with no game
                          behind it, as the web does. */}
                      {!isTeamSection ? (
                        <Text style={s.count}>—</Text>
                      ) : (
                      <TouchableOpacity
                        testID={`dispo-${row.player.id}-${i}`}
                        style={[
                          s.control,
                          cfg ? { borderColor: cfg.color, backgroundColor: cfg.bg } : null,
                          !editable && s.controlLocked,
                        ]}
                        disabled={!editable}
                        onPress={() => day?.game && onEditAvailability?.(row.player.id, day.game, i)}
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
                      )}
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
            <Text style={s.empty}>
              {isTeamSection
                ? 'Aucun joueur dans cette équipe.'
                : search?.value.trim()
                  ? `Aucun joueur ne correspond à « ${search.value.trim()} ».`
                  : 'Aucun autre joueur dans le club.'}
            </Text>
          )}

          {/* Résumé (#580) — the web's `tfoot`, and the only thing on this
              grid that answers about the *journée* rather than about a player.
              It is what says a compo is wrong: the Compo cells each show one
              player's team, so five names in a four-place line-up look
              correct on all five rows. Roster sections only — «Autres joueurs
              du club» has no fixture of its own to count. */}
          {isTeamSection && (
            <View style={s.summaryRow} testID="matrix-summary">
              <Text
                style={[s.summaryLabel, { width: c.joueur + c.dispo + c.joues + c.brulage }]}
              >
                Résumé
              </Text>
              {days.map((d, i) => {
                const verdict = d.totals ? summaryVerdict(d.totals) : null
                return (
                  <View key={i} style={s.pair}>
                    <View
                      testID={`summary-dispo-${i}`}
                      style={[
                        s.summaryCell,
                        { width: c.day },
                        verdict && {
                          backgroundColor: verdict.availableOk ? VERDICT.ok.bg : VERDICT.off.bg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.summaryText,
                          verdict && {
                            color: verdict.availableOk ? VERDICT.ok.text : VERDICT.off.text,
                          },
                        ]}
                      >
                        {d.totals ? `${d.totals.available}/${d.totals.required}` : '—'}
                      </Text>
                    </View>
                    <View
                      testID={`summary-compo-${i}`}
                      style={[
                        s.summaryCell,
                        { width: c.day },
                        verdict && {
                          backgroundColor: verdict.selectedOk ? VERDICT.ok.bg : VERDICT.off.bg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.summaryText,
                          verdict && {
                            color: verdict.selectedOk ? VERDICT.ok.text : VERDICT.off.text,
                          },
                        ]}
                      >
                        {d.totals ? `${d.totals.selected}/${d.totals.required}` : '—'}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

// ---------------------------------------------------------------------------
// L'échelle (#550)
//
// This grid took the web's column *widths* verbatim (`TABLE_COL_WIDTHS`) and
// then wrote them in a phone's type — 13pt names, 11pt in the controls, 10pt
// for a licence number — where the web draws the same table in `text-sm` (14)
// with `text-xs` (12) underneath it. Two grids meant to be the same grid, one
// of them a point to three points smaller, on the device held furthest away.
//
// So the sizes below are the web's pair, 14 and 12, with the name a step up at
// 15 because it is the column the eye returns to. The widths do not move: they
// were dimensioned for `text-sm` in the first place, which is exactly why the
// type is what had to catch up.
// ---------------------------------------------------------------------------
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
  heading: { flexShrink: 1 },
  teamName: { fontSize: 18, fontFamily: fonts.semiBold, color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  division: {
    fontSize: 12,
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
  pagerLabel: { fontSize: 13, color: colors.textSecondary, fontVariant: ['tabular-nums'] },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    // iOS renders TextInput placeholders with stray letter-spacing unless an
    // explicit value is set; pin it to 0 so they track normally (#118).
    letterSpacing: 0,
    // The phone's 44pt target: a text field is a text field whatever the slab.
    minHeight: 44,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  th: {
    fontSize: 14,
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
  dayNumber: { fontSize: 14, fontFamily: fonts.semiBold, color: colors.textPrimary },
  dayDate: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  dayDateWarn: { color: colors.warningText },
  dayOpponent: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  dayExempt: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginTop: 1 },

  subRow: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subPair: { flexDirection: 'row', borderLeftWidth: 1, borderLeftColor: colors.border },
  subTh: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 4,
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

  name: { fontSize: 15, color: colors.textPrimary, paddingHorizontal: 4 },
  nameCaptain: { fontFamily: fonts.bold },
  points: { color: colors.textSecondary },
  unlicensed: { fontFamily: fonts.semiBold, color: '#92400E' },
  license: { fontSize: 12, color: colors.textSecondary, paddingHorizontal: 4, marginTop: 1 },
  count: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    alignSelf: 'center',
    fontVariant: ['tabular-nums'],
  },
  brulage: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  brulageText: { fontSize: 13, color: colors.textSecondary },
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
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 6,
  },
  controlLocked: { opacity: 0.5 },
  controlText: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.textSecondary },
  controlTextEmpty: { color: colors.textSecondary },

  empty: { fontSize: 15, color: colors.textSecondary, padding: 16 },

  // The footer reads as a footer: the header's background, and a full-weight
  // top border where the rows above it use a hairline.
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summaryCell: { justifyContent: 'center', paddingVertical: 8 },
  summaryText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    textAlign: 'center',
    // Three journées of counts sit in a row; proportional digits make the
    // column ripple as the numbers change.
    fontVariant: ['tabular-nums'],
  },
})
