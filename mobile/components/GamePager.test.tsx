import { render, screen } from '@testing-library/react-native'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { GamePager } from './GamePager'
import { colors } from '@/constants/colors'
import type { GameNeighbours } from '@shared/lib/gameNeighbours'

// ---------------------------------------------------------------------------
// Les points sous la carte (#552) — the indicator, on the match axis.
//
// The gesture that drives them is `Pager.test.tsx`: the two are tested apart
// because they fail apart, and since #555 they live apart too — a dot on the
// wrong match is this file's, a swipe claimed too eagerly is the pager's.
// ---------------------------------------------------------------------------
const step = { gameId: 'g', teamId: 't', matchDayNumber: 1, teamNumber: 1 }

const neighbours = (index: number, total: number): GameNeighbours => ({
  axis: 'round',
  index,
  total,
  previous: index > 0 ? step : undefined,
  next: index < total - 1 ? step : undefined,
})

const dots = () =>
  screen.getByTestId('game-dots').children as unknown as { props: { style: StyleProp<ViewStyle> } }[]
/** The current dot is the accent-filled one — the accueil's own rule. */
const isActive = (i: number) =>
  StyleSheet.flatten(dots()[i].props.style)?.backgroundColor === colors.accent

describe('GamePager — les points', () => {
  it('draws one dot per match on the axis', () => {
    render(<GamePager neighbours={neighbours(1, 9)} />)

    expect(dots()).toHaveLength(9)
  })

  it('lights the one you are on, and only that one', () => {
    render(<GamePager neighbours={neighbours(4, 7)} />)

    expect(isActive(4)).toBe(true)
    expect(isActive(3)).toBe(false)
    expect(isActive(5)).toBe(false)
  })

  it('lights the first and the last where they are the ends', () => {
    const { rerender } = render(<GamePager neighbours={neighbours(0, 3)} />)
    expect(isActive(0)).toBe(true)

    rerender(<GamePager neighbours={neighbours(2, 3)} />)
    expect(isActive(2)).toBe(true)
  })
})
