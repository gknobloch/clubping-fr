import { screen } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import type { Club, Division, Game, Group, MatchDay, Phase, Player, Season, Team, User } from '@shared/types'
import HomeScreen from '@/app/(tabs)/index'

// ---------------------------------------------------------------------------
// Accueil — "Prochains matchs" stops at the day, not at the week (#561).
//
// Reported from a real Friday morning: the match had been played the Thursday
// before, and the card still led the carousel — printing "jeudi 17 septembre"
// under an orange "Aujourd'hui", with "Ma disponibilité" still asking for an
// answer to a match already played.
//
// The screen cut its list at the current Monday, so every match of the week
// stayed ahead of you until Sunday night; the web had always cut at the day.
// Both now go through `upcomingTeamGames`.
// ---------------------------------------------------------------------------
jest.mock('expo-calendar', () => ({ createEventInCalendarAsync: jest.fn() }))

const mockAuth: { user: User | null; displayName: string } = { user: null, displayName: 'Bo Martin' }
const mockData = {
  clubs: [] as Club[],
  seasons: [] as Season[],
  teams: [] as Team[],
  players: [] as Player[],
  matchDays: [] as MatchDay[],
  games: [] as Game[],
  phases: [] as Phase[],
  divisions: [] as Division[],
  groups: [] as Group[],
  gameAvailabilities: [],
  gameSelections: [],
  setAvailability: jest.fn(),
  clearAvailability: jest.fn(),
  setGameSelection: jest.fn(),
  refreshing: false,
  refresh: jest.fn(),
}

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const club: Club = {
  id: 'c1', affiliationNumber: '06680123', displayName: 'Rixheim PPA', isArchived: false,
  addresses: [{ id: 'a1', label: 'Salle des sports', street: '12 rue du Stade', postalCode: '68170', city: 'Rixheim', isDefault: true }],
  channels: [],
}
const opponentClub: Club = { ...club, id: 'c2', affiliationNumber: '06680456', displayName: 'Kembs TT', addresses: [] }

const player: Player = {
  id: 'p1', firstName: 'Bo', lastName: 'Martin', licenseNumber: '681001',
  phone: '0600000000', status: 'active', clubId: 'c1',
}
const team: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 5, divisionId: 'd1', groupId: 'grp1',
  gameLocationId: 'a1', defaultDay: 'Jeudi', defaultTime: '19h30', captainId: 'p1',
  isArchived: false, playerIds: ['p1'],
}
const opponent: Team = { ...team, id: 't2', clubId: 'c2', number: 3, playerIds: [] }

/**
 * The clock is pinned to the morning this was reported: Friday 18 September
 * 2026, the day after the match. Dates relative to the run would be a weaker
 * guard — started on a Monday, "yesterday" falls in the week before and the
 * week-based filter under test would drop it for the right answer by accident.
 *
 * Local noon, so the day is the same civil day in any runner's timezone.
 */
const TODAY = new Date(2026, 8, 18, 12, 0, 0)
const PLAYED_DATE = '2026-09-17'   // Thursday, the day before — already played.
const COMING_DATE = '2026-09-24'   // The next journée, a week out.

beforeEach(() => {
  jest.useFakeTimers({ now: TODAY, doNotFake: ['nextTick', 'setImmediate'] })
  mockAuth.user = { ...player, role: 'player', isPlayer: true } as User
  mockData.clubs = [club, opponentClub]
  mockData.seasons = [{ id: 's1', displayName: '2025/2026', status: 'active' }]
  mockData.phases = [{ id: 'ph1', seasonId: 's1', name: 'phase1', displayName: 'Phase 1', status: 'active' }]
  mockData.teams = [team, opponent]
  mockData.players = [player]
  mockData.matchDays = [
    { id: 'md1', groupId: 'grp1', number: 1, date: PLAYED_DATE },
    { id: 'md2', groupId: 'grp1', number: 2, date: COMING_DATE },
  ]
  mockData.games = [
    { id: 'g1', matchDayId: 'md1', homeTeamId: 't1', awayTeamId: 't2', time: '19h30' },
    { id: 'g2', matchDayId: 'md2', homeTeamId: 't2', awayTeamId: 't1', time: '19h30' },
  ]
  mockData.groups = [{ id: 'grp1', divisionId: 'd1', number: 1, teamIds: ['t1', 't2'], isArchived: false }]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'GE 6', rank: 6, playersPerGame: 4, isArchived: false },
  ]
})

afterEach(() => {
  jest.useRealTimers()
})

const dayAndMonth = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

describe("Accueil — un match joué n'est plus un prochain match", () => {
  it('leads with the match still to come, not yesterday’s', () => {
    render(<HomeScreen />)

    expect(screen.getByText('Prochain match')).toBeTruthy()
    expect(screen.getByText(new RegExp(dayAndMonth(COMING_DATE)))).toBeTruthy()
    expect(screen.queryByText(new RegExp(dayAndMonth(PLAYED_DATE)))).toBeNull()
  })

  it("does not announce yesterday's match as today's", () => {
    render(<HomeScreen />)

    expect(screen.queryByText("Aujourd'hui")).toBeNull()
  })

  it('shows the match being played today, which is the day the badge is true', () => {
    const todayDate = '2026-09-18'
    mockData.matchDays = [{ id: 'md1', groupId: 'grp1', number: 1, date: todayDate }]
    mockData.games = [{ id: 'g1', matchDayId: 'md1', homeTeamId: 't1', awayTeamId: 't2', time: '19h30' }]

    render(<HomeScreen />)

    expect(screen.getByText(new RegExp(dayAndMonth(todayDate)))).toBeTruthy()
    expect(screen.getByText("Aujourd'hui")).toBeTruthy()
  })
})
