import { useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import type { GameAxis, GameNeighbours, GameStep } from '@shared/lib/gameNeighbours'

// ---------------------------------------------------------------------------
// Passer d'un match au suivant (#552)
//
// The match screen is where a club officer collecting availabilities and a
// captain preparing a phase both spend their time, and both used to leave it
// through the back button to open the match right next to it. This is that
// step, in place.
//
// Not a `Switcher`, which the Journées, Équipes and Mes matchs screens share:
// there the chevrons walk an obvious sequence (the phase after this one, the
// journée after this one) and the title alone says where you are. Here the
// neighbour is Équipe 3, or J6 — nothing about the current match implies it,
// and a chevron that does not say where it lands is a chevron nobody presses.
// So each side carries its destination, and the middle says how far along the
// axis this match sits.
// ---------------------------------------------------------------------------

/** What a stop is called, which is the whole difference between the two axes. */
export function stepLabel(axis: GameAxis, step: GameStep): string {
  return axis === 'round' ? `Équipe ${step.teamNumber}` : `J${step.matchDayNumber}`
}

export function GamePager({
  neighbours,
  onGo,
}: {
  neighbours: GameNeighbours
  onGo: (step: GameStep) => void
}) {
  const { axis, index, total, previous, next } = neighbours
  return (
    <View style={styles.row}>
      <Side
        step={previous}
        label={previous ? stepLabel(axis, previous) : ''}
        hint="Match précédent"
        icon="chevron-back"
        testID="game-pager-prev"
        onGo={onGo}
      />
      <Text style={styles.position}>{index + 1} / {total}</Text>
      <Side
        step={next}
        label={next ? stepLabel(axis, next) : ''}
        hint="Match suivant"
        icon="chevron-forward"
        testID="game-pager-next"
        align="end"
        onGo={onGo}
      />
    </View>
  )
}

/**
 * One end of the row.
 *
 * An end with nowhere to go still takes its half of the width: the position in
 * the middle would otherwise slide sideways on the first and last match of the
 * axis, and a control that moves as you use it reads as a different control.
 */
function Side({
  step, label, hint, icon, testID, align, onGo,
}: {
  step?: GameStep
  label: string
  /** Which way this end goes, for a reader that cannot see the chevron. */
  hint: string
  icon: 'chevron-back' | 'chevron-forward'
  testID: string
  align?: 'end'
  onGo: (s: GameStep) => void
}) {
  if (!step) return <View style={styles.side} />
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${hint} : ${label}`}
      style={[styles.side, styles.sideLive, align === 'end' && styles.sideEnd]}
      activeOpacity={0.6}
      onPress={() => onGo(step)}
    >
      {icon === 'chevron-back' && (
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
      )}
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {icon === 'chevron-forward' && (
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
      )}
    </TouchableOpacity>
  )
}

/** Below this the finger has not travelled far enough to mean anything. */
const CLAIM_DX = 16
/** And below this it has not travelled far enough to mean a move. */
const MOVE_DX = 60

/**
 * Whether a travelling finger belongs to this and not to the scroller.
 *
 * The screen underneath is a long list of availability rows, and taking a
 * gesture from it would cost far more than this one is worth. So the swipe is
 * claimed only once the travel is clearly sideways: past `CLAIM_DX`, and twice
 * as far across as down.
 */
export function claimsSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > CLAIM_DX && Math.abs(dx) > Math.abs(dy) * 2
}

/**
 * Where a released finger lands: the next match, the previous one, or nowhere.
 *
 * Swiping left pulls the next match in from the right, as turning a page does.
 */
export function swipeDirection(dx: number): -1 | 1 | 0 {
  if (dx <= -MOVE_DX) return 1
  if (dx >= MOVE_DX) return -1
  return 0
}

/**
 * The same two moves, at the finger.
 *
 * Never claimed on touch-down at all: that is a tap, and it belongs to the row
 * underneath.
 *
 * The callback is read through a ref because `PanResponder.create` captures it
 * once, and where a move lands changes with every step along the axis.
 */
export function useSwipeBetweenGames(onSwipe: (direction: -1 | 1) => void) {
  const latest = useRef(onSwipe)
  latest.current = onSwipe
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => claimsSwipe(g.dx, g.dy),
      onPanResponderRelease: (_e, g) => {
        const direction = swipeDirection(g.dx)
        if (direction !== 0) latest.current(direction)
      },
    }),
  ).current
  return responder.panHandlers
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  // 44pt of target on a phone, as everything tappable is.
  side: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  sideLive: { paddingHorizontal: 4 },
  sideEnd: { justifyContent: 'flex-end' },
  label: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.textPrimary, flexShrink: 1 },
  position: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    letterSpacing: 0.3,
    paddingHorizontal: 8,
  },
})
