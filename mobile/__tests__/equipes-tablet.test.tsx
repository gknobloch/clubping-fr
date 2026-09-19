import { fireEvent, screen } from '@testing-library/react-native'
import { render, TABLET } from '@/__tests__/support/render'
import {
  givenParams,
  resetParams,
  setParams,
  useParams,
} from '@/__tests__/support/routeParams'
import {
  PHONE_WIDTH,
  TABLET_LANDSCAPE,
  TABLET_SMALL,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import type { Club, Division, Phase, Player, Team, User } from '@shared/types'
import EquipesScreen from '@/app/(tabs)/equipes'

// ---------------------------------------------------------------------------
// Équipes on a slab: the list and the fiche, side by side (#447)
//
// A club has half a dozen teams, so above the tablet threshold the tab was six
// cards and then eight hundred points of nothing. The fiche moves in beside
// them, and the tap that used to push a screen now picks a row.
//
// The fiche in the pane is the same component the pushed screen is — that is
// the point of the extraction — so what these pin is the seam: which of the
// two a tap gets, that the pane follows the selection, and that it lets go of
// a team the list no longer shows.
// ---------------------------------------------------------------------------
const mockPush = jest.fn()
const mockAuth: { user: User | null } = { user: null }
const mockData = {
  teams: [] as Team[],
  players: [] as Player[],
  clubs: [] as Club[],
  phases: [] as Phase[],
  divisions: [] as Division[],
  matchDays: [],
  games: [],
  gameSelections: [],
  // Per-season facts about a licensee (#482, #488) — none in these fixtures.
  seasons: [],
  playerSeasonLicences: [],
  playerSeasonCategories: [],
  // Nothing restricted: a division under no competition restricts nobody (#498).
  competitions: [],
  competitionEligibilities: [],
  updateTeam: jest.fn(),
  refreshing: false,
  refresh: jest.fn(),
}

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
// The selection lives in the route now (#585): the mock has to round-trip it,
// or a tap is recorded and the pane beside the list stays empty.
// `mock`-prefixed, the one shape jest's hoist check allows a factory to reach.
const mockSetParams = setParams
const mockUseParams = useParams
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => mockUseParams(),
  useNavigation: () => ({ setOptions: jest.fn() }),
}))
// Fetched over the network; the fiche's layout is what is under test.
jest.mock('@/components/ClubLogo', () => ({ ClubLogo: () => null }))

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}
const captain: Player = {
  id: 'p1', firstName: 'Bo', lastName: 'Martin', licenseNumber: '681001',
  phone: '0600000000', status: 'active', clubId: 'c1',
}

const phase1: Phase = {
  id: 'ph1', seasonId: 's1', name: 'phase1', displayName: '2026/2027 Phase 1', status: 'active',
}
const phase2: Phase = { ...phase1, id: 'ph2', name: 'phase2', displayName: '2026/2027 Phase 2', status: 'upcoming' }

const team1: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 1, divisionId: 'd1', groupId: 'g1',
  gameLocationId: 'a1', defaultDay: 'Vendredi', defaultTime: '20:00', captainId: 'p1',
  isArchived: false, playerIds: ['p1'],
}
const team2: Team = { ...team1, id: 't2', number: 2 }
/** The same club, the phase after — reachable only through the switcher. */
const laterTeam: Team = { ...team1, id: 't3', phaseId: 'ph2', number: 7 }

beforeEach(() => {
  resetParams()
  mockPush.mockClear()
  mockAuth.user = { ...captain, role: 'player', isPlayer: true } as User
  mockData.clubs = [club]
  mockData.players = [captain]
  mockData.teams = [team1, team2, laterTeam]
  mockData.phases = [phase1, phase2]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'Départementale 2', rank: 2, playersPerGame: 4, isArchived: false },
  ]
})

afterEach(resetWindowSize)

/** Team names are «<club> <n>» — the second team in the active phase. */
const TEAM_2 = 'Rixheim PPA 2'
const PLACEHOLDER = 'Choisissez une équipe pour afficher sa fiche.'

describe('on a phone', () => {
  it('pushes the fiche, as it always has', () => {
    setWindowSize(PHONE_WIDTH)

    render(<EquipesScreen />)
    fireEvent.press(screen.getByTestId('team-row-t2'))

    expect(mockPush).toHaveBeenCalledWith('/team/t2')
    // No pane, so nothing to invite a choice into.
    expect(screen.queryByText(PLACEHOLDER)).toBeNull()
    // And the chevron that promises the screen to come.
    expect(screen.getAllByText('›')).toHaveLength(2)
  })
})

describe('on a tablet', () => {
  it('opens on the list and an invitation, not on an arbitrary team', () => {
    setWindowSize(TABLET_SMALL)

    render(<EquipesScreen />, { metrics: TABLET })

    expect(screen.getByText(TEAM_2)).toBeTruthy()
    expect(screen.getByText(PLACEHOLDER)).toBeTruthy()
  })

  it('shows the fiche beside the list instead of over it', () => {
    setWindowSize(TABLET_SMALL)

    render(<EquipesScreen />, { metrics: TABLET })
    fireEvent.press(screen.getByTestId('team-row-t2'))

    // Nothing was pushed: the fiche is in the pane, and the list is still
    // there — the name is on screen twice, once per pane.
    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.queryByText(PLACEHOLDER)).toBeNull()
    expect(screen.getByText('Joueurs (1)')).toBeTruthy()
    expect(screen.getAllByText(TEAM_2)).toHaveLength(2)
    // No chevron beside a fiche that is already open.
    expect(screen.queryByText('›')).toBeNull()
  })

  it('marks the row the pane is showing', () => {
    setWindowSize(TABLET_SMALL)

    render(<EquipesScreen />, { metrics: TABLET })
    fireEvent.press(screen.getByTestId('team-row-t2'))

    // The highlight is what replaced the chevron, and it marks one row.
    expect(screen.getByTestId('team-row-t2').props.accessibilityState).toEqual({ selected: true })
    expect(screen.getByTestId('team-row-t1').props.accessibilityState).toEqual({})
  })

  it('lets go of a team the switcher has left behind', () => {
    // The pane must not go on showing a fiche from a phase that is no longer
    // on screen — and must find it again on the way back.
    setWindowSize(TABLET_SMALL)

    render(<EquipesScreen />, { metrics: TABLET })
    fireEvent.press(screen.getByTestId('team-row-t2'))
    expect(screen.queryByText(PLACEHOLDER)).toBeNull()

    fireEvent.press(screen.getByTestId('icon-chevron-forward'))
    expect(screen.getByText(PLACEHOLDER)).toBeTruthy()

    fireEvent.press(screen.getByTestId('icon-chevron-back'))
    expect(screen.queryByText(PLACEHOLDER)).toBeNull()
    expect(screen.getByText('Joueurs (1)')).toBeTruthy()
  })

  it('keeps the two panes when the slab turns', () => {
    setWindowSize(TABLET_LANDSCAPE)

    render(<EquipesScreen />, { metrics: TABLET })
    fireEvent.press(screen.getByTestId('team-row-t2'))

    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByText('Joueurs (1)')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Arriver avec une équipe déjà choisie (#585)
//
// The selection used to be a `useState` private to this screen, so a tap in the
// Journées matrix had nowhere to say which fiche it wanted. It lives in the
// route now, which is what makes «ouvrir une équipe» mean the same thing
// wherever it is asked.
// ---------------------------------------------------------------------------
describe('une sélection venue d’ailleurs', () => {
  it('ouvre la fiche demandée, liste à côté', () => {
    setWindowSize(TABLET_SMALL)
    givenParams({ selected: 't2' })

    render(<EquipesScreen />, { metrics: TABLET })

    expect(screen.queryByText(PLACEHOLDER)).toBeNull()
    expect(screen.getByTestId('team-row-t2').props.accessibilityState).toEqual({ selected: true })
  })

  it('suit l’équipe dans sa propre phase', () => {
    // t3 plays the phase after the active one. The matrix opens on the phase
    // being played and this tab on the active one, so the two disagree often —
    // and an empty pane would be the wrong answer to a team that was named.
    setWindowSize(TABLET_SMALL)
    givenParams({ selected: 't3' })

    render(<EquipesScreen />, { metrics: TABLET })

    expect(screen.getByText('Saison 2026/2027 Phase 2')).toBeTruthy()
    expect(screen.getByTestId('team-row-t3').props.accessibilityState).toEqual({ selected: true })
    expect(screen.queryByText(PLACEHOLDER)).toBeNull()
  })

  it('ne suit plus rien une fois le commutateur repris en main', () => {
    // The follow happens once, on arrival. A standing effect would undo every
    // move off the selected team's phase — the switcher would be inert.
    setWindowSize(TABLET_SMALL)
    givenParams({ selected: 't3' })

    render(<EquipesScreen />, { metrics: TABLET })
    fireEvent.press(screen.getByTestId('icon-chevron-back'))

    expect(screen.getByText('Saison 2026/2027 Phase 1')).toBeTruthy()
    expect(screen.getByText(PLACEHOLDER)).toBeTruthy()
  })

  it('ignore une équipe qui n’existe pas', () => {
    // A stale link, or a team deleted since. The invitation stands.
    setWindowSize(TABLET_SMALL)
    givenParams({ selected: 'disparue' })

    render(<EquipesScreen />, { metrics: TABLET })

    expect(screen.getByText(PLACEHOLDER)).toBeTruthy()
  })
})
