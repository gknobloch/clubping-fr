import { fireEvent, screen } from '@testing-library/react-native'
import { render, TABLET } from '@/__tests__/support/render'
import {
  PHONE_WIDTH,
  TABLET_LANDSCAPE,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import {
  resetParams,
  setParams,
  useParams,
} from '@/__tests__/support/routeParams'
import type {
  Club, Division, Game, Group, MatchDay, Phase, Player, Team, User,
} from '@shared/types'
import RoundScreen from '@/app/(tabs)/(detail)/round'

// ---------------------------------------------------------------------------
// « Journée X » — les matchs du club ce jour-là (#585)
//
// La date d'une colonne de la matrice menait droit au match, par-dessus la
// grille. Ce qu'on tient en cliquant une journée, c'est pourtant la journée :
// les rencontres du club à comparer. C'est le pendant de « Tous les matchs de
// cette équipe » sur l'autre axe (#552) — sur celui-ci, c'est l'équipe qui
// change d'une entrée à l'autre, et non la journée.
// ---------------------------------------------------------------------------
const mockSetParams = setParams
const mockUseParams = useParams
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), setParams: mockSetParams }),
  useLocalSearchParams: () => ({ gameId: 'g1', teamId: 't1', ...mockUseParams() }),
  useNavigation: () => ({ setOptions: mockSetOptions }),
}))
const mockSetOptions = jest.fn()

const mockAuth: { user: User | null } = { user: null }
const mockData = {
  clubs: [] as Club[],
  teams: [] as Team[],
  players: [] as Player[],
  matchDays: [] as MatchDay[],
  games: [] as Game[],
  phases: [] as Phase[],
  divisions: [] as Division[],
  groups: [] as Group[],
  gameAvailabilities: [] as never[],
  gameSelections: [] as never[],
  playerPhasePoints: [] as never[],
  seasons: [] as never[],
  playerSeasonLicences: [] as never[],
  playerSeasonCategories: [] as never[],
  competitions: [] as never[],
  competitionEligibilities: [] as never[],
  setAvailability: jest.fn(),
  clearAvailability: jest.fn(),
  setGameSelection: jest.fn(),
}

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA',
  isArchived: false, addresses: [], channels: [],
}
const opponentClub: Club = { ...club, id: 'c2', displayName: 'Kembs TT' }

const captain: Player = {
  id: 'p1', firstName: 'Louis', lastName: 'Thomas', licenseNumber: '9900031',
  phone: '0600000000', status: 'active', clubId: 'c1',
}

const phase: Phase = {
  id: 'ph1', seasonId: 's1', name: 'phase1', displayName: '2026/2027 Phase 1',
  status: 'active',
}

/** Deux équipes du club, chacune dans sa poule, chacune son match ce jour-là. */
const team1: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 1, divisionId: 'd1', groupId: 'grp1',
  gameLocationId: 'a1', defaultDay: 'Samedi', defaultTime: '16h00', captainId: 'p1',
  isArchived: false, playerIds: ['p1'],
}
const team2: Team = { ...team1, id: 't2', number: 2, groupId: 'grp2', playerIds: ['p1'] }
/** Une troisième, exempte : elle ne doit pas paraître au rail. */
const team3: Team = { ...team1, id: 't3', number: 3, groupId: 'grp3', playerIds: [] }

const opponents: Team[] = [
  { ...team1, id: 'o1', clubId: 'c2', number: 8, groupId: 'grp1', playerIds: [] },
  { ...team1, id: 'o2', clubId: 'c2', number: 9, groupId: 'grp2', playerIds: [] },
]

beforeEach(() => {
  resetParams()
  mockSetOptions.mockClear()
  mockAuth.user = { ...captain, role: 'player', isPlayer: true } as User
  mockData.clubs = [club, opponentClub]
  mockData.teams = [team1, team2, team3, ...opponents]
  mockData.players = [captain]
  mockData.phases = [phase]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'GE 3', rank: 3, playersPerGame: 4, isArchived: false },
  ]
  mockData.groups = [
    { id: 'grp1', divisionId: 'd1', number: 1, teamIds: ['t1', 'o1'], isArchived: false },
    { id: 'grp2', divisionId: 'd1', number: 2, teamIds: ['t2', 'o2'], isArchived: false },
    { id: 'grp3', divisionId: 'd1', number: 3, teamIds: ['t3'], isArchived: false },
  ]
  // Même journée 5, une ligne par poule (#474).
  mockData.matchDays = [
    { id: 'md1', groupId: 'grp1', number: 5, date: '2099-01-10' },
    { id: 'md2', groupId: 'grp2', number: 5, date: '2099-01-10' },
    { id: 'md3', groupId: 'grp3', number: 5, date: '2099-01-10' },
  ]
  // La troisième équipe est exempte : sa poule a une journée, pas de match.
  mockData.games = [
    { id: 'g1', matchDayId: 'md1', homeTeamId: 't1', awayTeamId: 'o1', time: '16h00' },
    { id: 'g2', matchDayId: 'md2', homeTeamId: 'o2', awayTeamId: 't2', time: '16h00' },
  ]
})

afterEach(resetWindowSize)

const renderTablet = () => {
  setWindowSize(TABLET_LANDSCAPE)
  render(<RoundScreen />, { metrics: TABLET })
}

it('se nomme d’après la journée', () => {
  renderTablet()

  expect(mockSetOptions).toHaveBeenCalledWith({ title: 'Journée 5' })
})

it('liste les matchs du club ce jour-là, l’équipe puis l’adversaire', () => {
  renderTablet()

  expect(screen.getByTestId('round-game-g1-t1')).toBeTruthy()
  expect(screen.getByTestId('round-game-g2-t2')).toBeTruthy()
  // L'équipe du club, puis contre qui : sur cet axe c'est l'équipe qui change.
  expect(screen.getByText('Rixheim PPA 1')).toBeTruthy()
  expect(screen.getByText('Kembs TT 8')).toBeTruthy()
  expect(screen.getAllByText('sam. 10 janv.')).toHaveLength(2)
})

it('laisse dehors une équipe exempte', () => {
  // Pas de match, pas d'écran à ouvrir : une ligne qui ne mène nulle part.
  renderTablet()

  expect(screen.queryByText('Rixheim PPA 3')).toBeNull()
})

it('ouvre sur le match d’où l’on vient', () => {
  renderTablet()

  expect(screen.getByTestId('round-game-g1-t1').props.accessibilityState).toEqual({
    selected: true,
  })
})

it('met un autre match du rail dans le volet', () => {
  renderTablet()

  fireEvent.press(screen.getByTestId('round-game-g2-t2'))

  expect(screen.getByTestId('round-game-g2-t2').props.accessibilityState).toEqual({
    selected: true,
  })
  expect(screen.getByTestId('round-game-g1-t1').props.accessibilityState).toEqual({})
  expect(screen.getByText('Disponibilités')).toBeTruthy()
})

it('en deçà du seuil, garde le match qu’on lisait', () => {
  // Rien n'atteint cet écran depuis un téléphone — la matrice est réservée aux
  // tablettes. Une fenêtre rétrécie en cours de route rend donc le match, pas
  // une liste que personne n'a demandée.
  setWindowSize(PHONE_WIDTH)

  render(<RoundScreen />)

  expect(screen.queryByTestId('round-game-g1-t1')).toBeNull()
  expect(screen.getByText('Disponibilités')).toBeTruthy()
})
