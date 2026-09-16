import { fireEvent, screen, within } from '@testing-library/react-native'
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

/**
 * A club of `size` teams, one poule each, all playing journée 1.
 *
 * "Journée 1" is therefore `size` MatchDay rows, which is the shape that makes
 * the round axis a derivation rather than a filter on a number — and nine or
 * twelve of them is the club size the strip exists for (Rixheim fields nine).
 */
function clubOf(size: number) {
  mockData.teams = [
    ...Array.from({ length: size }, (_, i) => makeTeam(`t${i + 1}`, i + 1, `grp${i + 1}`)),
    makeTeam('opp', 99, 'grp1', 'c2'),
  ]
  mockData.matchDays = Array.from({ length: size }, (_, i) => ({
    id: `md-g${i + 1}-j1`, groupId: `grp${i + 1}`, number: 1, date: '2025-09-06',
  }))
  mockData.games = Array.from({ length: size }, (_, i) => ({
    id: `j1-t${i + 1}`, matchDayId: `md-g${i + 1}-j1`, homeTeamId: `t${i + 1}`, awayTeamId: 'opp',
  }))
  mockData.groups = Array.from({ length: size }, (_, i) => ({
    id: `grp${i + 1}`, divisionId: 'd1', number: i + 1, teamIds: [`t${i + 1}`], isArchived: false,
  }))
}

// Three club teams, three poules, two journées — Équipe 3 sits journée 2 out.
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

    expect(screen.getByText('Éq. 1')).toBeTruthy()
    expect(screen.getByText('Éq. 3')).toBeTruthy()
    expect(screen.getByLabelText('Éq. 2').props.accessibilityState).toMatchObject({ selected: true })
  })

  it('reaches the ninth team of a nine-team club in one tap', () => {
    // The size this is for: stepping would mean passing the seven nobody asked
    // for, and a dot would not have said which one was the ninth.
    clubOf(9)
    mockParams.id = 'j1-t1'
    mockParams.teamId = 't1'

    render(<MatchDetailScreen />)
    fireEvent.press(screen.getByLabelText('Éq. 9'))

    expect(mockSetParams).toHaveBeenCalledWith({ id: 'j1-t9', teamId: 't9', from: 'round' })
  })

  it('names all twelve of a twelve-team club’s matches', () => {
    clubOf(12)
    mockParams.id = 'j1-t1'
    mockParams.teamId = 't1'

    render(<MatchDetailScreen />)

    // Nothing is dropped or collapsed past the width — the strip scrolls.
    expect(screen.getAllByTestId(/^game-step-j1-t\d+$/)).toHaveLength(12)
    expect(screen.getByText('Éq. 12')).toBeTruthy()
  })

  it('moves in place, keeping the axis — back still returns to the list', () => {
    render(<MatchDetailScreen />)

    fireEvent.press(screen.getByLabelText('Éq. 3'))

    expect(mockSetParams).toHaveBeenCalledWith({ id: 'j1-t3', teamId: 't3', from: 'round' })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('skips the team that sits the round out', () => {
    mockParams.id = 'j2-t2'

    render(<MatchDetailScreen />)

    // Journée 2 is Équipe 1 and Équipe 2 only — Équipe 3 sits it out.
    expect(screen.getByText('Éq. 1')).toBeTruthy()
    expect(screen.getByText('Éq. 2')).toBeTruthy()
    expect(screen.queryByText('Éq. 3')).toBeNull()
  })
})

describe('Détail d’un match — arrivé d’une équipe', () => {
  it('walks that team’s phase when the caller names the axis', () => {
    mockParams.from = 'team'

    render(<MatchDetailScreen />)

    // Scoped to the strip: the header card right above carries its own «J1»
    // badge, and the two agreeing is the point rather than a clash.
    const strip = within(screen.getByTestId('game-strip'))
    expect(strip.getByText('J1')).toBeTruthy()
    expect(strip.getByText('J2')).toBeTruthy()
    expect(strip.getByLabelText('J1').props.accessibilityState).toMatchObject({ selected: true })
  })

  it('is what an opener that says nothing gets — the accueil, Mes matchs, a notification', () => {
    render(<MatchDetailScreen />)

    fireEvent.press(screen.getByLabelText('J2'))

    expect(mockSetParams).toHaveBeenCalledWith({ id: 'j2-t2', teamId: 't2', from: 'team' })
  })
})

describe('Détail d’un match — rien à parcourir', () => {
  it('shows no strip when the axis holds this match alone', () => {
    mockParams.id = 'j1-t3'
    mockParams.teamId = 't3'

    render(<MatchDetailScreen />)

    expect(screen.queryByTestId('game-strip')).toBeNull()
  })
})
