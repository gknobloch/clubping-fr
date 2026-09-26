import { fireEvent, screen } from '@testing-library/react-native'
import { render, TABLET } from '@/__tests__/support/render'
import {
  PHONE_WIDTH,
  TABLET_LANDSCAPE,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import {
  givenParams,
  resetParams,
  setParams,
  useParams,
} from '@/__tests__/support/routeParams'
import type {
  Club, Division, Game, Group, MatchDay, Phase, Player, Team, User,
} from '@shared/types'
import PhaseGamesScreen from '@/app/(tabs)/(detail)/team/phase-games'

// ---------------------------------------------------------------------------
// « Tous les matchs de cette équipe », sur une tablette (#585)
//
// The screen used to be a column: the roster with its play-counts, then a card
// per match, each one a push away from the match itself. On a slab that is a
// list of doors in a room twice as wide as it needs.
//
// It becomes a rail — « Résumé » and one entry per journée — and the match
// itself in the pane beside it. Below the threshold nothing moves.
// ---------------------------------------------------------------------------
const mockPush = jest.fn()

const mockSetParams = setParams
const mockUseParams = useParams
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => ({ teamId: 't1', ...mockUseParams() }),
  useNavigation: () => ({ setOptions: jest.fn() }),
}))

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
  gameSelections: [] as { teamId: string; gameId: string; playerIds: string[] }[],
  playerPhasePoints: [] as never[],
  seasons: [] as never[],
  playerSeasonLicences: [] as never[],
  playerSeasonCategories: [] as never[],
  competitions: [] as never[],
  competitionGroups: [] as never[],
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
const mate: Player = { ...captain, id: 'p2', firstName: 'Inès', lastName: 'Martin' }

const phase: Phase = {
  id: 'ph1', seasonId: 's1', name: 'phase1', displayName: '2026/2027 Phase 1',
  status: 'active',
}
const team: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 3, divisionId: 'd1', groupId: 'grp1',
  gameLocationId: 'a1', defaultDay: 'Samedi', defaultTime: '16h00', captainId: 'p1',
  isArchived: false, playerIds: ['p1', 'p2'],
}
const opponents: Team[] = [4, 5].map((n) => ({
  ...team, id: `opp${n}`, clubId: 'c2', number: n, playerIds: [],
}))

beforeEach(() => {
  resetParams()
  mockPush.mockClear()
  mockAuth.user = { ...captain, role: 'player', isPlayer: true } as User
  mockData.clubs = [club, opponentClub]
  mockData.teams = [team, ...opponents]
  mockData.players = [captain, mate]
  mockData.phases = [phase]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'GE 3', rank: 3, playersPerGame: 4, isArchived: false },
  ]
  mockData.groups = [
    { id: 'grp1', divisionId: 'd1', number: 1, teamIds: ['t1', ...opponents.map((t) => t.id)], isArchived: false },
  ]
  mockData.matchDays = [
    { id: 'md1', groupId: 'grp1', number: 1, date: '2099-01-03' },
    { id: 'md2', groupId: 'grp1', number: 2, date: '2099-01-10' },
  ]
  mockData.games = [
    { id: 'g1', matchDayId: 'md1', homeTeamId: 't1', awayTeamId: 'opp4', time: '16h00' },
    { id: 'g2', matchDayId: 'md2', homeTeamId: 'opp5', awayTeamId: 't1', time: '16h00' },
  ]
  mockData.gameSelections = [{ teamId: 't1', gameId: 'g1', playerIds: ['p1'] }]
})

afterEach(resetWindowSize)

describe('sur un téléphone', () => {
  it('reste la colonne qu’il a toujours été', () => {
    setWindowSize(PHONE_WIDTH)

    render(<PhaseGamesScreen />)

    expect(screen.getByText('Matchs (2)')).toBeTruthy()
    expect(screen.queryByTestId('rail-resume')).toBeNull()
  })
})

describe('sur une tablette', () => {
  const renderTablet = () => {
    setWindowSize(TABLET_LANDSCAPE)
    render(<PhaseGamesScreen />, { metrics: TABLET })
  }

  it('ouvre sur le Résumé, l’effectif à côté', () => {
    renderTablet()

    expect(screen.getByTestId('rail-resume').props.accessibilityState).toEqual({
      selected: true,
    })
    // Ce que l'écran montrait en haut : qui est là, et ce que chacun a joué.
    expect(screen.getByText('Joueurs (2)')).toBeTruthy()
  })

  it('donne une entrée par journée, l’adversaire et la date', () => {
    renderTablet()

    expect(screen.getByTestId('rail-game-g1')).toBeTruthy()
    expect(screen.getByTestId('rail-game-g2')).toBeTruthy()
    expect(screen.getByText('Kembs TT 4')).toBeTruthy()
    expect(screen.getByText('J1 · sam. 3 janv.')).toBeTruthy()
  })

  it('met le match dans le volet, sans le pousser', () => {
    renderTablet()

    fireEvent.press(screen.getByTestId('rail-game-g1'))

    // Le détail du match, là où était le Résumé.
    expect(screen.getByText('Disponibilités')).toBeTruthy()
    expect(screen.queryByText('Joueurs (2)')).toBeNull()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('ne repropose pas « tous les matchs » depuis le volet', () => {
    // C'est l'écran où l'on se trouve déjà, et le rail *est* cette liste.
    renderTablet()
    fireEvent.press(screen.getByTestId('rail-game-g1'))

    expect(screen.queryByText('Tous les matchs de l’équipe')).toBeNull()
  })

  it('ouvre directement sur le match que la route nomme', () => {
    givenParams({ selected: 'g2' })

    renderTablet()

    expect(screen.getByTestId('rail-game-g2').props.accessibilityState).toEqual({
      selected: true,
    })
    expect(screen.getByText('Disponibilités')).toBeTruthy()
  })
})
