import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, PanResponder,
} from 'react-native'
import { colors } from '@/constants/colors'
import { fonts } from '@/constants/typography'
import type { GameAxis, GameNeighbours, GameStep } from '@shared/lib/gameNeighbours'

// ---------------------------------------------------------------------------
// Passer d'un match au suivant (#552)
//
// The match screen is where a club officer collecting availabilities and a
// captain preparing a phase both spend their time, and both used to leave it
// through the back button to open the match right next to it. This is that
// step, in place: the strip sits under the match header, exactly where the
// accueil's carousel puts its dots.
//
// **Named chips and not those dots**, and the reason is the journée axis. Dots
// scale further than they look — the accueil's are `12n + 6` points wide, so
// twelve of them take 150pt of a 343pt column and twenty-eight still fit. What
// stops at nine is what a dot *means*: the accueil's carousel is chronological,
// so position carries it, and you only ever move one step. Here the axis can be
// a club's nine or twelve teams, which is a set you look things up in — "which
// dot is l'Équipe 9?" is answerable only by counting, and a 6pt dot is no tap
// target, so reaching it means swiping past the eight nobody asked for.
//
// So each stop is named (`J5`, `Éq. 3` — both abbreviations this app already
// uses where space is short) and tappable at 44pt. Past six or seven the strip
// **scrolls** rather than shrinking: nothing drops under the tap rule, nothing
// goes anonymous, and a twelve-team club fits whole in a tablet's 640pt column.
// The chips carry their own numbers, so there is no "5 / 12" to print — that is
// what a counter is for under dots that have no names.
// ---------------------------------------------------------------------------

/** What a stop is called, which is the whole difference between the two axes. */
export function stepLabel(axis: GameAxis, step: GameStep): string {
  return axis === 'round' ? `Éq. ${step.teamNumber}` : `J${step.matchDayNumber}`
}

export function GamePager({
  neighbours,
  onGo,
}: {
  neighbours: GameNeighbours
  onGo: (step: GameStep) => void
}) {
  const { axis, steps, index } = neighbours
  const scroller = useRef<ScrollView>(null)
  // Where each chip sits, as laid out rather than as computed: the labels are
  // not all the same width ("J7" against "Éq. 12"), so the only honest way to
  // centre one is to ask it.
  const layouts = useRef(new Map<number, { x: number; width: number }>())
  const [viewport, setViewport] = useState(0)
  const settled = useRef(false)

  // Keep the current match in view. The first placement is not animated — the
  // strip should open already showing where you are, not slide there.
  useEffect(() => {
    const chip = layouts.current.get(index)
    if (!chip || !viewport) return
    const x = Math.max(0, chip.x - (viewport - chip.width) / 2)
    scroller.current?.scrollTo({ x, animated: settled.current })
    settled.current = true
  }, [index, viewport, steps.length])

  return (
    <ScrollView
      ref={scroller}
      horizontal
      testID="game-strip"
      showsHorizontalScrollIndicator={false}
      onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
      contentContainerStyle={styles.row}
    >
      {steps.map((step, i) => {
        const current = i === index
        return (
          <TouchableOpacity
            key={`${step.gameId}:${step.teamId}`}
            testID={`game-step-${step.gameId}`}
            accessibilityRole="button"
            accessibilityState={{ selected: current }}
            accessibilityLabel={stepLabel(axis, step)}
            style={[styles.chip, current && styles.chipCurrent]}
            activeOpacity={0.6}
            onPress={() => onGo(step)}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout
              layouts.current.set(i, { x, width })
            }}
          >
            {/* The colour is what tells one club team from another everywhere
                else in the app, so it rides here too — and only on the axis
                where the stops *are* teams. */}
            {axis === 'round' && (
              <View
                testID={`game-chip-color-${step.gameId}`}
                style={[styles.dot, { backgroundColor: step.teamColor ?? colors.accent }]}
              />
            )}
            <Text style={[styles.label, current && styles.labelCurrent]} numberOfLines={1}>
              {stepLabel(axis, step)}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
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
 * The step at the finger, over the whole screen rather than over the card.
 *
 * Never claimed on touch-down at all: that is a tap, and it belongs to the row
 * underneath — the strip's own chips included.
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
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 2, paddingVertical: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    // 44pt of target on a phone, as everything tappable is — and the width a
    // one-digit chip would otherwise fall under.
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipCurrent: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  dot: { width: 8, height: 8, borderRadius: 2 },
  label: { fontSize: 13, fontFamily: fonts.semiBold, color: colors.textSecondary },
  labelCurrent: { color: colors.accent },
})
