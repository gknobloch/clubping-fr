import { render, screen } from '@testing-library/react-native'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { MAX_DOTS, PagerDots, PagerPosition, claimsSwipe, swipeDirection } from './Pager'
import { colors } from '@/constants/colors'

// ---------------------------------------------------------------------------
// The app's one carousel (#552, #555) — the indicator and the gesture rule.
//
// They are tested apart because they fail apart: a dot in the wrong place is a
// wrong indicator, a swipe claimed too eagerly is a scroller that stopped
// working. What each carousel counts along is its caller's business and is
// tested there (`GamePager.test.tsx` for the match axis).
// ---------------------------------------------------------------------------
const dots = () =>
  screen.getByTestId('pager-dots').children as unknown as { props: { style: StyleProp<ViewStyle> } }[]
/** The current dot is the accent-filled one — the accueil's own rule. */
const isActive = (i: number) =>
  StyleSheet.flatten(dots()[i].props.style)?.backgroundColor === colors.accent

describe('PagerDots', () => {
  it('draws one dot per card', () => {
    render(<PagerDots index={1} total={9} />)

    expect(dots()).toHaveLength(9)
  })

  it('lights the one you are on, and only that one', () => {
    render(<PagerDots index={4} total={7} />)

    expect(isActive(4)).toBe(true)
    expect(isActive(3)).toBe(false)
    expect(isActive(5)).toBe(false)
  })

  it('draws nothing for a single card — one card is not a carousel', () => {
    render(<PagerDots index={0} total={1} />)

    expect(screen.queryByTestId('pager-dots')).toBeNull()
  })

  it('draws nothing at all past the width a row can indicate in', () => {
    // A club's licence list is routinely sixty long (#555). Sixty dots is a
    // dotted line from edge to edge, with the current one indistinguishable —
    // so the caller is told there is no indicator, rather than given a bad one.
    render(<PagerDots index={12} total={MAX_DOTS + 1} />)

    expect(screen.queryByTestId('pager-dots')).toBeNull()
  })

  it('still draws the longest row that does fit', () => {
    render(<PagerDots index={0} total={MAX_DOTS} />)

    expect(dots()).toHaveLength(MAX_DOTS)
  })

  it('stretches the current dot rather than only colouring it', () => {
    // The elongated dot is what the accueil's carousel does, and copying it is
    // the whole reason this component is shared rather than redrawn.
    render(<PagerDots index={0} total={3} />)

    expect(StyleSheet.flatten(dots()[0].props.style)?.width).toBeGreaterThan(
      StyleSheet.flatten(dots()[1].props.style)?.width as number,
    )
  })
})

describe('PagerPosition', () => {
  it('draws the dots while they fit', () => {
    render(<PagerPosition index={1} total={9} />)

    expect(screen.getByTestId('pager-position').children).toHaveLength(9)
  })

  it('counts in words past the width a row of dots has', () => {
    // And this is the only form that says HOW MANY there are, which is the
    // first thing a fifty-three card deck is asked.
    render(<PagerPosition index={11} total={53} />)

    expect(screen.getByTestId('pager-position')).toHaveTextContent('12 / 53')
  })

  it('counts from one, not from zero', () => {
    render(<PagerPosition index={0} total={53} />)

    expect(screen.getByTestId('pager-position')).toHaveTextContent('1 / 53')
  })

  it('draws nothing for a single card, in either form', () => {
    render(<PagerPosition index={0} total={1} />)

    expect(screen.queryByTestId('pager-position')).toBeNull()
  })
})

describe('the swipe rule', () => {
  it('leaves a vertical drag to the scroller', () => {
    expect(claimsSwipe(20, 60)).toBe(false)
    expect(claimsSwipe(0, 120)).toBe(false)
  })

  it('leaves a barely moved finger alone — that is a tap that wobbled', () => {
    expect(claimsSwipe(12, 0)).toBe(false)
  })

  it('claims a clearly sideways drag', () => {
    expect(claimsSwipe(40, 10)).toBe(true)
    expect(claimsSwipe(-40, 10)).toBe(true)
  })

  it('turns the page the way the finger went, and not for a nudge', () => {
    expect(swipeDirection(-120)).toBe(1)
    expect(swipeDirection(120)).toBe(-1)
    expect(swipeDirection(-40)).toBe(0)
  })
})
