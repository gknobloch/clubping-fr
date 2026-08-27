import { fireEvent, screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import type { AvailabilityStatus, Player } from '@shared/types'
import { NextMatchCard, type TeamAnswers } from './NextMatchCard'

// ---------------------------------------------------------------------------
// The Accueil hero card (#459)
//
// Wide enough, and it splits: the game and the answer it wants from me on one
// side, what everybody else answered on the other. Narrow, it is the card the
// phone has always had — the summary line, and the roster one tap away on the
// match screen.
// ---------------------------------------------------------------------------
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => ({ players: [], clubs: [] }) }))

function player(id: string, firstName: string, lastName: string): Player {
  return {
    id, firstName, lastName, licenseNumber: `L-${id}`,
    phone: '', status: 'active', clubId: 'c1',
  }
}

const roster = [
  player('p1', 'Nathan', 'Thomas'),
  player('p2', 'Hugo', 'Bernard'),
  player('p3', 'Inès', 'Bernard'),
]

const answers: Record<string, AvailabilityStatus | undefined> = {
  p1: 'available',
  p2: 'maybe',
  p3: undefined,
}

const onSet = jest.fn()
const onClear = jest.fn()

function team(over: Partial<TeamAnswers> = {}): TeamAnswers {
  return {
    roster,
    mePlayerId: 'p1',
    availabilityOf: (id) => answers[id],
    selectedIds: [],
    canEdit: false,
    onSet,
    onClear,
    onOpenPlayer: jest.fn(),
    ...over,
  }
}

function renderCard({ wide = false, canEdit = false, isCaptain = false } = {}) {
  render(
    <NextMatchCard
      matchDayNumber={1}
      matchDayDate="2026-09-17"
      time="19h30"
      confirmed
      divisionLabel="GE 6"
      teamNumber={5}
      isHome
      teamName="Rixheim PPA 5"
      opponentName="Kembs TT 3"
      venueLabel="Rixheim"
      myAvailability="available"
      canSetAvailability
      onPickAvailability={jest.fn()}
      onClearAvailability={jest.fn()}
      availableCount={1}
      noResponseCount={1}
      availablePlayers={[roster[0]]}
      playersPerGame={4}
      selectedCount={0}
      isCaptain={isCaptain}
      onCompose={jest.fn()}
      onOpenDetail={jest.fn()}
      onAddToCalendar={jest.fn()}
      wide={wide}
      team={team({ canEdit })}
    />,
  )
}

beforeEach(() => {
  onSet.mockClear()
  onClear.mockClear()
})

describe('narrow', () => {
  it('keeps the summary line and leaves the roster to the match screen', () => {
    renderCard({ wide: false })

    expect(screen.getByText(/1 disponible · 1 sans réponse/)).toBeTruthy()
    expect(screen.queryByText('Hugo Bernard')).toBeNull()
    expect(screen.queryByTestId('match-card-split')).toBeNull()
  })
})

describe('split', () => {
  it('names everybody, and drops the line that was counting them', () => {
    renderCard({ wide: true })

    expect(screen.getByTestId('match-card-split')).toBeTruthy()
    expect(screen.getByText('Nathan Thomas')).toBeTruthy()
    expect(screen.getByText('Hugo Bernard')).toBeTruthy()
    expect(screen.getByText('Inès Bernard')).toBeTruthy()
    expect(screen.queryByText(/1 disponible ·/)).toBeNull()
  })

  it('still says how many are yet to answer', () => {
    renderCard({ wide: true })

    expect(screen.getByText('1 sans réponse')).toBeTruthy()
  })

  it('keeps my own answer on the game side, above the roster', () => {
    // The stacked order is why it lives there: game → my answer → the team.
    // "Oui" is the segmented control; the roster's own pills read "OUI".
    renderCard({ wide: true })

    expect(screen.getByText('Ma disponibilité')).toBeTruthy()
    expect(screen.getByText('Oui')).toBeTruthy()
  })
})

describe('a captain answering for the team', () => {
  it('sets a team-mate with one tap on the pill, no menu in between', () => {
    renderCard({ wide: true, canEdit: true, isCaptain: true })

    // Row order is roster order: Hugo is the second.
    fireEvent.press(screen.getAllByText('NON')[1])

    expect(onSet).toHaveBeenCalledWith('p2', 'unavailable')
  })

  it('clears an answer by tapping the pill that is already on', () => {
    renderCard({ wide: true, canEdit: true, isCaptain: true })

    fireEvent.press(screen.getAllByText('PE')[1])

    expect(onClear).toHaveBeenCalledWith('p2')
    expect(onSet).not.toHaveBeenCalled()
  })

  it('leaves everyone else reading, and answering only for themselves', () => {
    renderCard({ wide: true, canEdit: false })

    fireEvent.press(screen.getAllByText('NON')[1])
    expect(onSet).not.toHaveBeenCalled()

    // My own row is mine to set, captain or not.
    fireEvent.press(screen.getAllByText('NON')[0])
    expect(onSet).toHaveBeenCalledWith('p1', 'unavailable')
  })
})
