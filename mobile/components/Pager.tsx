import { useRef } from 'react'
import { View, StyleSheet, PanResponder } from 'react-native'
import { colors } from '@/constants/colors'

// ---------------------------------------------------------------------------
// Le carrousel de l'app (#552, #555)
//
// The accueil's dots, the match screen's, and now the FFTT import's review:
// one row of 6pt dots under a card, and a sideways swipe that moves it. This
// is that thing, once — #555 needed exactly what #552 had built, and a second
// carousel that looked almost like the first is the outcome CLAUDE.md warns
// about under *Passer d'un match à l'autre*.
//
// The dots stay an indicator and not a control: 6pt is no tap target, and what
// moves you is the gesture.
//
// They scale further than they look: `12n + 6` points wide, so a nine-card row
// is 114pt of a 343pt column and twenty-eight would still fit.
// ---------------------------------------------------------------------------

/**
 * Past this many, dots stop indicating anything.
 *
 * A row is `12n + 6` points wide, so twenty-eight of them is 342pt — the whole
 * of a phone's 343pt content column, with the current one indistinguishable
 * from its neighbours. #552's axes are short by nature (a club's teams, a
 * phase's journées) and never come near it; #555's is a club's licence list,
 * and Rixheim's is sixty, which draws a dotted line from edge to edge.
 */
export const MAX_DOTS = 28

/**
 * Where you are in the row, and how long the row is — or nothing at all, when
 * a row of dots would say nothing.
 *
 * Both ends are refused. One card is not a carousel, which is the very thing
 * `gameNeighbours` says by returning `null` on an axis of one; and past
 * `MAX_DOTS` the row is a dotted line with no current dot in it.
 *
 * Answered here rather than at each call site, for the same reason: a caller
 * that has to decide whether the indicator is worth drawing will eventually
 * decide differently from the next one. A deck outside these bounds says where
 * it is in words instead.
 */
export function PagerDots({
  index,
  total,
  testID = 'pager-dots',
}: {
  index: number
  total: number
  testID?: string
}) {
  if (total < 2 || total > MAX_DOTS) return null
  return (
    <View testID={testID} style={styles.dots}>
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
 * Whether a travelling finger belongs to the pager and not to the scroller.
 *
 * The screen underneath is a list — availability rows on the match screen, the
 * fields of a licence on the import's — and taking a gesture from it would
 * cost far more than this one is worth. So the swipe is claimed only once the
 * travel is clearly sideways: past `CLAIM_DX`, and twice as far across as down.
 */
export function claimsSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > CLAIM_DX && Math.abs(dx) > Math.abs(dy) * 2
}

/**
 * Where a released finger lands: the next card, the previous one, or nowhere.
 *
 * Swiping left pulls the next card in from the right, as turning a page does.
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
export function usePagerSwipe(onSwipe: (direction: -1 | 1) => void) {
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
