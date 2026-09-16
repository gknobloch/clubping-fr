import { useRef } from 'react'
import { View, StyleSheet, PanResponder } from 'react-native'
import { colors } from '@/constants/colors'
import type { GameNeighbours } from '@shared/lib/gameNeighbours'

// ---------------------------------------------------------------------------
// Passer d'un match au suivant (#552)
//
// The match screen is where a club officer collecting availabilities and a
// captain preparing a phase both spend their time, and both used to leave it
// through the back button to open the match right next to it. This is that
// step, in place: swipe the screen, and the dots under the header card say
// where you are.
//
// The dots are the accueil's, deliberately — same 6pt, same elongated current
// one, same row. A carousel already exists in this app and this is one, so it
// is that one. They stay an indicator and not a control, for the same reason
// the accueil's are: 6pt is no tap target, and the thing that moves you is the
// gesture. Someone after one particular match still has the list they came
// from, one back-press away — which is exactly what they had before this
// existed, so nothing is taken.
//
// They scale further than they look: `12n + 6` points wide, so a nine-team
// club's row is 114pt of a 343pt column and twenty-eight would still fit.
// ---------------------------------------------------------------------------
export function GamePager({ neighbours }: { neighbours: GameNeighbours }) {
  const { index, total } = neighbours
  return (
    <View testID="game-dots" style={styles.dots}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
      ))}
    </View>
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

// The accueil's carousel dots, to the point. Sitting in a `gap: 12` scroller
// they would float mid-way between the card they belong to and the section
// below; the negative margin pulls them back under the card, which is what
// makes them read as its indicator rather than as a divider.
const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: -4, marginBottom: -2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 18 },
})
