import { fireEvent, screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import type { Club, Division, Game, Group, MatchDay, Phase, Player, Team, User } from '@shared/types'
import MatchDetailScreen from '@/app/(tabs)/(detail)/match/[id]'

// ---------------------------------------------------------------------------
// Passer d'un match au suivant (#552)
//
// What this screen owes the pager is a choice and a move: which axis the
// neighbours run along — the screen that opened it says so — and that stepping
// stays *in place*, so the back button still returns to the list in one press
// rather than replaying every match walked through.
//
// The axis itself is `@shared/lib/gameNeighbours`, tested without a screen.
//
// Under __tests__/ rather than beside the screen: expo-router routes every file
// under app/, and a test there is bundled into the app.
// ---------------------------------------------------------------------------
jest.mock('expo-calendar', () => ({
  createEventInCalendarAsync: jest.fn().mockResolvedValue({ action: 'canceled' }),
}))

const mockParams: { id: string; teamId: string; from?: string } = { id: 'j1-t2', teamId: 't2' }
const mockPush = jest.fn()
const mockSetParams = jest.fn()

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
  gameAvailabilities: [],
  gameSelections: [],
  playerPhasePoints: [],
  seasons: [],
  playerSeasonLicences: [],
  playerSeasonCategories: [],
  competitions: [],
  competitionEligibilities: [],
  setAvailability: jest.fn(),
  clearAvailability: jest.fn(),
  setGameSelection: jest.fn(),
}

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ setOptions: jest.fn() }),
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
}))

const club: Club = {
  id: 'c1',
  affiliationNumber: '06680123',
  displayName: 'Rixheim PPA',
  isArchived: false,
  addresses: [],
  channels: [],
}
const opponentClub: Club = { ...club, id: 'c2', displayName: 'Mulhouse TT', affiliationNumber: '06680456' }

const player: Player = {
  id: 'p1',
  firstName: 'Bo',
  lastName: 'Martin',
  licenseNumber: '681001',
  phone: '0600000000',
  status: 'active',
  clubId: 'c1',
}

const makeTeam = (id: string, number: number, groupId: string, clubId = 'c1'): Team => ({
  id,
  clubId,
  phaseId: 'ph1',
  number,
  divisionId: 'd1',
  groupId,
  gameLocationId: 'a1',
  defaultDay: 'Samedi',
  defaultTime: '17h00',
  captainId: 'p1',
  isArchived: false,
  playerIds: clubId === 'c1' ? ['p1'] : [],
})

// Three club teams, three poules, two journées — Équipe 3 sits journée 2 out.
// "Journée 1" is therefore three MatchDay rows, which is the shape that makes
// the round axis a derivation rather than a filter on a number.
beforeEach(() => {
  mockPush.mockClear()
  mockSetParams.mockClear()
  mockParams.id = 'j1-t2'
  mockParams.teamId = 't2'
  delete mockParams.from
  mockAuth.user = { ...player, role: 'player', isPlayer: true }
  mockData.clubs = [club, opponentClub]
  mockData.players = [player]
  mockData.phases = [
    { id: 'ph1', seasonId: 's1', name: '2025/2026 Phase 1', displayName: '2025/2026 Phase 1', status: 'active' },
  ]
  mockData.teams = [
    makeTeam('t1', 1, 'grp1'),
    makeTeam('t2', 2, 'grp2'),
    makeTeam('t3', 3, 'grp3'),
    makeTeam('opp', 9, 'grp2', 'c2'),
  ]
  mockData.matchDays = [
    { id: 'md-g1-j1', groupId: 'grp1', number: 1, date: '2025-09-06' },
    { id: 'md-g2-j1', groupId: 'grp2', number: 1, date: '2025-09-06' },
    { id: 'md-g3-j1', groupId: 'grp3', number: 1, date: '2025-09-06' },
    { id: 'md-g2-j2', groupId: 'grp2', number: 2, date: '2025-09-13' },
    { id: 'md-g1-j2', groupId: 'grp1', number: 2, date: '2025-09-13' },
  ]
  mockData.games = [
    { id: 'j1-t1', matchDayId: 'md-g1-j1', homeTeamId: 't1', awayTeamId: 'opp' },
    { id: 'j1-t2', matchDayId: 'md-g2-j1', homeTeamId: 't2', awayTeamId: 'opp' },
    { id: 'j1-t3', matchDayId: 'md-g3-j1', homeTeamId: 't3', awayTeamId: 'opp' },
    { id: 'j2-t1', matchDayId: 'md-g1-j2', homeTeamId: 't1', awayTeamId: 'opp' },
    { id: 'j2-t2', matchDayId: 'md-g2-j2', homeTeamId: 't2', awayTeamId: 'opp' },
  ]
  mockData.groups = [
    { id: 'grp1', divisionId: 'd1', number: 1, teamIds: ['t1'], isArchived: false },
    { id: 'grp2', divisionId: 'd1', number: 2, teamIds: ['t2', 'opp'], isArchived: false },
    { id: 'grp3', divisionId: 'd1', number: 3, teamIds: ['t3'], isArchived: false },
  ]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'GE 5', rank: 5, playersPerGame: 4, isArchived: false },
  ]
})

describe('Détail d’un match — arrivé des Journées', () => {
  beforeEach(() => {
    mockParams.from = 'round'
  })

  it('offers the club’s other matches of the same journée', () => {
    render(<MatchDetailScreen />)

    expect(screen.getByText('Équipe 1')).toBeTruthy()
    expect(screen.getByText('Équipe 3')).toBeTruthy()
    expect(screen.getByText('2 / 3')).toBeTruthy()
  })

  it('moves in place, keeping the axis — back still returns to the list', () => {
    render(<MatchDetailScreen />)

    fireEvent.press(screen.getByTestId('game-pager-next'))

    expect(mockSetParams).toHaveBeenCalledWith({ id: 'j1-t3', teamId: 't3', from: 'round' })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('skips the team that sits the round out', () => {
    mockParams.id = 'j2-t2'

    render(<MatchDetailScreen />)

    // Journée 2 is Équipe 1 and Équipe 2 only, so Équipe 2 is the last stop.
    expect(screen.getByText('2 / 2')).toBeTruthy()
    expect(screen.getByText('Équipe 1')).toBeTruthy()
    expect(screen.queryByTestId('game-pager-next')).toBeNull()
  })
})

describe('Détail d’un match — arrivé d’une équipe', () => {
  it('walks that team’s phase when the caller names the axis', () => {
    mockParams.from = 'team'

    render(<MatchDetailScreen />)

    expect(screen.getByText('J2')).toBeTruthy()
    expect(screen.getByText('1 / 2')).toBeTruthy()
  })

  it('is what an opener that says nothing gets — the accueil, Mes matchs, a notification', () => {
    render(<MatchDetailScreen />)

    fireEvent.press(screen.getByTestId('game-pager-next'))

    expect(mockSetParams).toHaveBeenCalledWith({ id: 'j2-t2', teamId: 't2', from: 'team' })
  })
})

describe('Détail d’un match — rien à parcourir', () => {
  it('shows no pager when the axis holds this match alone', () => {
    mockParams.id = 'j1-t3'
    mockParams.teamId = 't3'

    render(<MatchDetailScreen />)

    expect(screen.queryByTestId('game-pager-next')).toBeNull()
    expect(screen.queryByTestId('game-pager-prev')).toBeNull()
  })
})
