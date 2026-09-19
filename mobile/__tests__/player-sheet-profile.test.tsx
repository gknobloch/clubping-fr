import { fireEvent, screen } from '@testing-library/react-native'
import { render, TABLET } from '@/__tests__/support/render'
import {
  PHONE_WIDTH,
  TABLET_LANDSCAPE,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import type { Club, Player, Season } from '@shared/types'
import { PlayerSheet } from '@/components/PlayerSheet'

// ---------------------------------------------------------------------------
// Où mène « Profil » (#585)
//
// The aperçu is the one thing every name in the app opens, so its footer button
// is the single place that decides where a full fiche is read. It used to push
// `/player/:id` over whatever section you were in, which is how a licensee
// reached from Équipes ended up alone in a 640pt column with no list beside it
// (#582).
//
// It now lands in the Joueurs tab with that licensee selected — and the whole
// point is that it is the **default**, so no screen has to remember.
// ---------------------------------------------------------------------------
const mockPush = jest.fn()

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}
const player: Player = {
  id: 'p1', firstName: 'Camille', lastName: 'Durand', licenseNumber: '9900002',
  phone: '0600000000', status: 'active', clubId: 'c1',
}
const season: Season = {
  id: 's1', displayName: '2026/2027', status: 'active', isArchived: false,
} as Season

const mockData = {
  clubs: [club],
  players: [player],
  seasons: [season],
  playerSeasonLicences: [] as never[],
}

jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

const onClose = jest.fn()

function renderSheet() {
  render(
    <PlayerSheet
      player={player}
      gamesPlayed={0}
      team={null}
      brulageTeam={null}
      history={[]}
      onClose={onClose}
    />,
    { metrics: TABLET },
  )
}

beforeEach(() => {
  mockPush.mockClear()
  onClose.mockClear()
})

afterEach(resetWindowSize)

it('mène à l’onglet Joueurs, ce licencié sélectionné', () => {
  setWindowSize(TABLET_LANDSCAPE)

  renderSheet()
  fireEvent.press(screen.getByTestId('player-sheet-profile'))

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/joueurs',
    params: { selected: 'p1' },
  })
  // La feuille se referme : elle a fini de servir, et ce qu'elle recouvrait
  // n'est pas où l'on va.
  expect(onClose).toHaveBeenCalled()
})

it('pousse la fiche sur un téléphone, comme toujours', () => {
  // Pas de liste à côté de laquelle atterrir, donc rien à sélectionner : la
  // fiche poussée reste la bonne réponse, et c'est ce que `(detail)` sert.
  setWindowSize(PHONE_WIDTH)

  renderSheet()
  fireEvent.press(screen.getByTestId('player-sheet-profile'))

  expect(mockPush).toHaveBeenCalledWith('/player/p1')
})

it('laisse un appelant décider à sa place', () => {
  // L'échappatoire existe pour qui doit faire quelque chose *avant* — refermer
  // sa propre feuille, par exemple.
  const onProfile = jest.fn()
  setWindowSize(TABLET_LANDSCAPE)

  render(
    <PlayerSheet
      player={player}
      gamesPlayed={0}
      team={null}
      brulageTeam={null}
      history={[]}
      onClose={onClose}
      onProfile={onProfile}
    />,
    { metrics: TABLET },
  )
  fireEvent.press(screen.getByTestId('player-sheet-profile'))

  expect(onProfile).toHaveBeenCalled()
  expect(mockPush).not.toHaveBeenCalled()
})
