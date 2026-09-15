import { fireEvent, render, screen } from '@testing-library/react-native'
import { GamePager, claimsSwipe, stepLabel, swipeDirection } from './GamePager'
import type { GameNeighbours } from '@shared/lib/gameNeighbours'

// ---------------------------------------------------------------------------
// Le passage d'un match à l'autre (#552) — the row and the gesture rule.
//
// The two are tested apart because they fail apart: a chevron that says the
// wrong thing is a wrong label, a swipe claimed too eagerly is a scroller that
// stopped working.
// ---------------------------------------------------------------------------
const step = (over: Partial<GameNeighbours['next']> = {}) => ({
  gameId: 'g', teamId: 't', matchDayNumber: 1, teamNumber: 1, ...over,
})

describe('GamePager', () => {
  it('names the club’s teams on the round axis', () => {
    const neighbours: GameNeighbours = {
      axis: 'round',
      index: 1,
      total: 3,
      previous: step({ gameId: 'g1', teamId: 't1', teamNumber: 1 }),
      next: step({ gameId: 'g3', teamId: 't3', teamNumber: 3 }),
    }

    render(<GamePager neighbours={neighbours} onGo={jest.fn()} />)

    expect(screen.getByText('Équipe 1')).toBeTruthy()
    expect(screen.getByText('Équipe 3')).toBeTruthy()
    expect(screen.getByText('2 / 3')).toBeTruthy()
  })

  it('names the journées on the team axis', () => {
    const neighbours: GameNeighbours = {
      axis: 'team',
      index: 4,
      total: 14,
      previous: step({ gameId: 'g4', matchDayNumber: 4 }),
      next: step({ gameId: 'g6', matchDayNumber: 6 }),
    }

    render(<GamePager neighbours={neighbours} onGo={jest.fn()} />)

    expect(screen.getByText('J4')).toBeTruthy()
    expect(screen.getByText('J6')).toBeTruthy()
    expect(screen.getByText('5 / 14')).toBeTruthy()
  })

  it('hands back the whole stop, not a game id — the team is half of it', () => {
    const onGo = jest.fn()
    const next = step({ gameId: 'g3', teamId: 't3', teamNumber: 3 })

    render(
      <GamePager
        neighbours={{ axis: 'round', index: 0, total: 2, next }}
        onGo={onGo}
      />,
    )
    fireEvent.press(screen.getByTestId('game-pager-next'))

    expect(onGo).toHaveBeenCalledWith(next)
  })

  it('says which way an end goes, for a reader who cannot see the chevron', () => {
    render(
      <GamePager
        neighbours={{ axis: 'round', index: 0, total: 2, next: step({ teamNumber: 3 }) }}
        onGo={jest.fn()}
      />,
    )

    expect(screen.getByLabelText('Match suivant : Équipe 3')).toBeTruthy()
  })

  it('offers no end that leads nowhere', () => {
    render(
      <GamePager
        neighbours={{ axis: 'team', index: 0, total: 2, next: step({ matchDayNumber: 2 }) }}
        onGo={jest.fn()}
      />,
    )

    expect(screen.queryByTestId('game-pager-prev')).toBeNull()
    expect(screen.getByTestId('game-pager-next')).toBeTruthy()
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
  it('says what tells one stop from another on each axis', () => {
    expect(stepLabel('round', step({ teamNumber: 2 }))).toBe('Équipe 2')
    expect(stepLabel('team', step({ matchDayNumber: 12 }))).toBe('J12')
  })
})
