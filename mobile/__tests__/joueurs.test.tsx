import { fireEvent, screen } from '@testing-library/react-native'
import { render, TABLET } from '@/__tests__/support/render'
import {
  PHONE_WIDTH,
  TABLET_LANDSCAPE,
  TABLET_SMALL,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import type { Club, Phase, Player, Role, Season, Team, User } from '@shared/types'
import JoueursScreen from '@/app/(tabs)/joueurs'

// ---------------------------------------------------------------------------
// Joueurs — the club directory (#438). The tab listed everyone the payload
// carried, archived members included, with no way to narrow it. An archived
// member has left the club: they are only of interest to the people who
// administer it, and even for them the list opens on the active roster.
// ---------------------------------------------------------------------------
const mockPush = jest.fn()
const mockAuth: { user: User | null } = { user: null }
// The fiche in the right-hand pane reads more of the payload than the list does.
const mockData: {
  players: Player[]
  clubs: Club[]
  teams: Team[]
  phases: Phase[]
  seasons: Season[]
  playerPhasePoints: never[]
} = { players: [], clubs: [], teams: [], phases: [], seasons: [], playerPhasePoints: [] }

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({ setOptions: jest.fn() }),
}))

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}

const active: Player = {
  id: 'p1', firstName: 'Joris', lastName: 'Szulc', licenseNumber: '686956',
  phone: '0600000000', status: 'active', clubId: 'c1',
}
const archived: Player = {
  id: 'p2', firstName: 'Ancien', lastName: 'Membre', licenseNumber: '681234',
  phone: '0611111111', status: 'archived', clubId: 'c1',
}

const signIn = (role: Role) => {
  mockAuth.user = { id: 'u1', role, isPlayer: role === 'player', clubId: 'c1' }
}

const LABEL = 'Joueurs actifs uniquement'

beforeEach(() => {
  mockPush.mockClear()
  mockData.players = [active, archived]
  mockData.clubs = [club]
  mockData.teams = []
  mockData.phases = []
  mockData.seasons = []
})

describe('Joueurs — joueurs actifs uniquement (#438)', () => {
  it('opens on the active roster for a member, with no way to widen it', () => {
    signIn('player')
    render(<JoueursScreen />)

    expect(screen.getByText('Joris Szulc')).toBeTruthy()
    expect(screen.queryByText('Ancien Membre')).toBeNull()
    expect(screen.queryByLabelText(LABEL)).toBeNull()
  })

  it('gives a club admin the switch, on by default', () => {
    signIn('club_admin')
    render(<JoueursScreen />)

    expect(screen.getByLabelText(LABEL).props.value).toBe(true)
    expect(screen.queryByText('Ancien Membre')).toBeNull()
  })

  it('brings the archived ones in, badged, when the switch goes off', () => {
    signIn('club_admin')
    render(<JoueursScreen />)

    fireEvent(screen.getByLabelText(LABEL), 'valueChange', false)

    expect(screen.getByText('Ancien Membre')).toBeTruthy()
    expect(screen.getByText('Archivé')).toBeTruthy()
  })

  // The badge used to sit on every card, green and saying «Actif» — nothing,
  // repeated once per row. It is now the exception marker it reads as.
  it('badges nothing on the active roster', () => {
    signIn('club_admin')
    render(<JoueursScreen />)

    expect(screen.queryByText('Actif')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Joueurs en deux panneaux (#466)
//
// The two-column grid #446 gave the tablet here is gone: a 320pt list pane
// holds one column, so the grid and the panes cannot both exist. The grid
// served scanning a roster; the panes serve finding one person, which is what
// the search box says this tab is for.
//
// The rule that is *not* Équipes' rule is the last test here, and it is the
// reason this section could not be a copy: the selection is read from the
// roster and not from the search results.
// ---------------------------------------------------------------------------
describe('Joueurs — la fiche à côté de la liste (#466)', () => {
  afterEach(resetWindowSize)

  const PLACEHOLDER = 'Choisissez un licencié pour afficher sa fiche.'
  /** Rendered by the fiche, and by nothing in the list. */
  const FICHE_SECTION = 'Informations'

  it('pushes the fiche on a phone, as it always has', () => {
    signIn('club_admin')
    setWindowSize(PHONE_WIDTH)

    render(<JoueursScreen />)
    fireEvent.press(screen.getByTestId('player-row-p1'))

    expect(mockPush).toHaveBeenCalledWith('/player/p1')
    expect(screen.queryByText(PLACEHOLDER)).toBeNull()
  })

  it('opens on the roster and an invitation, not on an arbitrary licencié', () => {
    signIn('club_admin')
    setWindowSize(TABLET_SMALL)

    render(<JoueursScreen />, { metrics: TABLET })

    expect(screen.getByText('Joris Szulc')).toBeTruthy()
    expect(screen.getByText(PLACEHOLDER)).toBeTruthy()
  })

  it('shows the fiche beside the list instead of over it', () => {
    signIn('club_admin')
    setWindowSize(TABLET_SMALL)

    render(<JoueursScreen />, { metrics: TABLET })
    fireEvent.press(screen.getByTestId('player-row-p1'))

    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByText(FICHE_SECTION)).toBeTruthy()
    // The name is on screen twice — once per pane — and the row is marked.
    expect(screen.getAllByText('Joris Szulc')).toHaveLength(2)
    expect(screen.getByTestId('player-row-p1').props.accessibilityState).toEqual({
      selected: true,
    })
  })

  it('keeps the two panes when the slab turns', () => {
    signIn('club_admin')
    setWindowSize(TABLET_LANDSCAPE)

    render(<JoueursScreen />, { metrics: TABLET })
    fireEvent.press(screen.getByTestId('player-row-p1'))

    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByText(FICHE_SECTION)).toBeTruthy()
  })

  it('does not blank the fiche being read while you type to find the next one', () => {
    // Équipes reads its selection from the phase on screen, so the switcher
    // empties the pane — changing phase changes the subject. Typing does not.
    // Read from the search results, this fiche would vanish on the first
    // keystroke that no longer matches the person you are reading about.
    signIn('club_admin')
    setWindowSize(TABLET_SMALL)

    render(<JoueursScreen />, { metrics: TABLET })
    fireEvent.press(screen.getByTestId('player-row-p1'))

    fireEvent.changeText(screen.getByPlaceholderText('Rechercher…'), 'ancien')

    // The list has narrowed past the selected licencié…
    expect(screen.queryByTestId('player-row-p1')).toBeNull()
    // …and the fiche is still there.
    expect(screen.getByText(FICHE_SECTION)).toBeTruthy()
    expect(screen.getByText('Joris Szulc')).toBeTruthy()
  })

  it('does empty the pane when the roster itself changes under it', () => {
    // The archived switch is the other kind of change: it is a statement about
    // who this list is about, and a fiche from outside it has no business
    // staying open.
    signIn('club_admin')
    setWindowSize(TABLET_SMALL)

    render(<JoueursScreen />, { metrics: TABLET })
    fireEvent(screen.getByLabelText(LABEL), 'valueChange', false)
    fireEvent.press(screen.getByTestId('player-row-p2')) // the archived member
    expect(screen.getByText(FICHE_SECTION)).toBeTruthy()

    fireEvent(screen.getByLabelText(LABEL), 'valueChange', true)

    expect(screen.getByText(PLACEHOLDER)).toBeTruthy()
  })
})
