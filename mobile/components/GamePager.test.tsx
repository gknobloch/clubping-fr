import { fireEvent, render, screen } from '@testing-library/react-native'
import { GamePager, claimsSwipe, stepLabel, swipeDirection } from './GamePager'
import type { GameNeighbours, GameStep } from '@shared/lib/gameNeighbours'

// ---------------------------------------------------------------------------
// La bande de matchs (#552) — the strip and the gesture rule.
//
// The two are tested apart because they fail apart: a chip that says the wrong
// thing is a wrong label, a swipe claimed too eagerly is a scroller that
// stopped working.
//
// What the strip owes the club with nine teams is that its ninth is *named* and
// *reachable in one tap* — the two things a row of dots cannot give, and the
// whole reason this is not the accueil's carousel indicator.
// ---------------------------------------------------------------------------
const teamSteps = (count: number): GameStep[] =>
  Array.from({ length: count }, (_, i) => ({
    gameId: `g${i + 1}`,
    teamId: `t${i + 1}`,
    matchDayNumber: 1,
    teamNumber: i + 1,
    teamColor: '#374151',
  }))

const roundSteps = (count: number): GameStep[] =>
  Array.from({ length: count }, (_, i) => ({
    gameId: `g${i + 1}`,
    teamId: 't1',
    matchDayNumber: i + 1,
    teamNumber: 1,
  }))

const neighbours = (
  axis: GameNeighbours['axis'],
  steps: GameStep[],
  index: number,
): GameNeighbours => ({
  axis,
  steps,
  index,
  total: steps.length,
  previous: steps[index - 1],
  next: steps[index + 1],
})

describe('GamePager — la bande', () => {
  it('names every one of a nine-team club’s matches on the round axis', () => {
    render(<GamePager neighbours={neighbours('round', teamSteps(9), 1)} onGo={jest.fn()} />)

    expect(screen.getByText('Éq. 1')).toBeTruthy()
    expect(screen.getByText('Éq. 9')).toBeTruthy()
    expect(screen.getAllByTestId(/^game-step-/)).toHaveLength(9)
  })

  it('names the journées on the team axis', () => {
    render(<GamePager neighbours={neighbours('team', roundSteps(7), 4)} onGo={jest.fn()} />)

    expect(screen.getByText('J1')).toBeTruthy()
    expect(screen.getByText('J7')).toBeTruthy()
  })

  it('reaches the ninth team in one tap, and hands back the whole stop', () => {
    const onGo = jest.fn()
    const steps = teamSteps(9)

    render(<GamePager neighbours={neighbours('round', steps, 0)} onGo={onGo} />)
    fireEvent.press(screen.getByLabelText('Éq. 9'))

    expect(onGo).toHaveBeenCalledWith(steps[8])
  })

  it('marks where you are, and marks only that', () => {
    render(<GamePager neighbours={neighbours('round', teamSteps(9), 2)} onGo={jest.fn()} />)

    expect(screen.getByLabelText('Éq. 3').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByLabelText('Éq. 2').props.accessibilityState).toMatchObject({ selected: false })
  })

  it('carries the team colour only where the stops are teams', () => {
    const { rerender } = render(
      <GamePager neighbours={neighbours('round', teamSteps(3), 0)} onGo={jest.fn()} />,
    )
    expect(screen.getByTestId('game-chip-color-g1')).toBeTruthy()

    rerender(<GamePager neighbours={neighbours('team', roundSteps(3), 0)} onGo={jest.fn()} />)

    // Every stop on the team axis is the same team, so a colour would say
    // nothing — and a dot that never varies reads as decoration.
    expect(screen.queryByTestId('game-chip-color-g1')).toBeNull()
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

describe('stepLabel', () => {
  it('uses the short forms this app already uses where space is tight', () => {
    expect(stepLabel('round', teamSteps(3)[1])).toBe('Éq. 2')
    expect(stepLabel('team', roundSteps(12)[11])).toBe('J12')
  })
})
