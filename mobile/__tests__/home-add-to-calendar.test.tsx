import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { Club, Division, Game, Group, MatchDay, Phase, Player, Season, Team, User } from '@shared/types'
import HomeScreen from '@/app/(tabs)/index'

// ---------------------------------------------------------------------------
// Accueil — the "Ajouter au calendrier" icon on the next-match card (#426).
//
// #416 had left it off this card deliberately: the whole card is a link to the
// match detail. But this is where a player answers OUI, and blocking the
// evening is the gesture right after — so the icon lives here too, and its
// press must not open the detail screen instead.
// ---------------------------------------------------------------------------
const mockCreateEvent = jest.fn().mockResolvedValue({ action: 'saved', id: 'e1' })
jest.mock('expo-calendar', () => ({
  createEventInCalendarAsync: (...args: unknown[]) => mockCreateEvent(...args),
}))

const mockPush = jest.fn()
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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

const club: Club = {
  id: 'c1',
  affiliationNumber: '06680123',
  displayName: 'Rixheim PPA',
  isArchived: false,
  addresses: [
    { id: 'a1', label: 'Salle des sports', street: '12 rue du Stade', postalCode: '68170', city: 'Rixheim', isDefault: true },
  ],
  channels: [],
}
const opponentClub: Club = { ...club, id: 'c2', affiliationNumber: '06680456', displayName: 'Mulhouse TT', addresses: [] }

const player: Player = {
  id: 'p1', firstName: 'Bo', lastName: 'Martin', licenseNumber: '681001',
  phone: '0600000000', status: 'active', clubId: 'c1',
}

const team: Team = {
  id: 't1', clubId: 'c1', phaseId: 'ph1', number: 4, divisionId: 'd1', groupId: 'grp1',
  gameLocationId: 'a1', defaultDay: 'Jeudi', defaultTime: '19h30', captainId: 'p1',
  isArchived: false, playerIds: ['p1'],
}
const opponent: Team = { ...team, id: 't2', clubId: 'c2', number: 6, playerIds: [] }

/** A fixture in a fortnight — the card only shows games from this week on. */
function inTwoWeeks(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}
const matchDate = inTwoWeeks()

beforeEach(() => {
  mockCreateEvent.mockClear().mockResolvedValue({ action: 'saved', id: 'e1' })
  mockPush.mockClear()
  mockAuth.user = { ...player, role: 'player', isPlayer: true } as User
  mockData.clubs = [club, opponentClub]
  mockData.seasons = [{ id: 's1', displayName: '2025/2026', status: 'active' }]
  mockData.phases = [{ id: 'ph1', seasonId: 's1', name: 'phase1', displayName: 'Phase 1', status: 'active' }]
  mockData.teams = [team, opponent]
  mockData.players = [player]
  mockData.matchDays = [{ id: 'md1', groupId: 'grp1', number: 1, date: matchDate }]
  mockData.games = [{ id: 'g1', matchDayId: 'md1', homeTeamId: 't1', awayTeamId: 't2', time: '19h30' }]
  mockData.groups = [{ id: 'grp1', divisionId: 'd1', number: 1, teamIds: ['t1', 't2'], isArchived: false }]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'GE 5', rank: 5, playersPerGame: 4, isArchived: false },
  ]
})

describe('Accueil — ajouter le prochain match au calendrier', () => {
  it('offers the icon on the next-match card', () => {
    render(<HomeScreen />)

    expect(screen.getByLabelText('Ajouter au calendrier')).toBeTruthy()
  })

  it('hands the OS the match the card shows, without opening the detail screen', async () => {
    render(<HomeScreen />)

    fireEvent.press(screen.getByLabelText('Ajouter au calendrier'))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalled())
    const [y, m, d] = matchDate.split('-').map(Number)
    expect(mockCreateEvent).toHaveBeenCalledWith({
      title: 'Rixheim PPA 4 – Mulhouse TT 6',
      startDate: new Date(y, m - 1, d, 19, 30),
      endDate: new Date(y, m - 1, d, 23, 0),
      allDay: false,
      location: 'Salle des sports, 12 rue du Stade, 68170 Rixheim',
      notes: 'Journée 1 · GE 5',
    })
    // The card around it is a link to the match: the icon must win the press.
    expect(mockPush).not.toHaveBeenCalled()
  })
})
