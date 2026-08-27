import { Alert } from 'react-native'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { render } from '@/__tests__/support/render'
import type { Club, Division, Game, Group, MatchDay, Player, Team, User } from '@shared/types'
import MatchDetailScreen from '@/app/(tabs)/(detail)/match/[id]'

// ---------------------------------------------------------------------------
// Détail d'un match — the "Ajouter au calendrier" icon in the match header
// (#416). What is worth asserting here is the hand-off: that the icon is
// offered to everyone, and that the event handed to the OS carries the match
// the screen displays.
// The event's own shape is covered by utils/calendar.test.ts.
//
// Under __tests__/ rather than beside the screen: expo-router routes every
// file under app/, and a test there is bundled into the app.
// ---------------------------------------------------------------------------
const mockCreateEvent = jest.fn().mockResolvedValue({ action: 'saved', id: 'e1' })
jest.mock('expo-calendar', () => ({
  createEventInCalendarAsync: (...args: unknown[]) => mockCreateEvent(...args),
}))

const mockAuth: { user: User | null } = { user: null }
const mockData = {
  clubs: [] as Club[],
  teams: [] as Team[],
  players: [] as Player[],
  matchDays: [] as MatchDay[],
  games: [] as Game[],
  phases: [],
  divisions: [] as Division[],
  groups: [] as Group[],
  gameAvailabilities: [],
  gameSelections: [],
  playerPhasePoints: [],
  setAvailability: jest.fn(),
  clearAvailability: jest.fn(),
  setGameSelection: jest.fn(),
}

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'g1', teamId: 't1' }),
  useNavigation: () => ({ setOptions: jest.fn() }),
  useRouter: () => ({ push: jest.fn() }),
}))

const club: Club = {
  id: 'c1',
  affiliationNumber: '06680123',
  displayName: 'Rixheim PPA',
  isArchived: false,
  addresses: [
    {
      id: 'a1',
      label: 'Salle des sports',
      street: '12 rue du Stade',
      postalCode: '68170',
      city: 'Rixheim',
      isDefault: true,
    },
  ],
  channels: [],
}

const opponentClub: Club = {
  id: 'c2',
  affiliationNumber: '06680456',
  displayName: 'Mulhouse TT',
  isArchived: false,
  addresses: [],
  channels: [],
}

const player: Player = {
  id: 'p1',
  firstName: 'Bo',
  lastName: 'Martin',
  licenseNumber: '681001',
  phone: '0600000000',
  status: 'active',
  clubId: 'c1',
}

const team: Team = {
  id: 't1',
  clubId: 'c1',
  phaseId: 'ph1',
  number: 4,
  divisionId: 'd1',
  groupId: 'grp1',
  gameLocationId: 'a1',
  defaultDay: 'Jeudi',
  defaultTime: '19h30',
  captainId: 'p1',
  isArchived: false,
  playerIds: ['p1'],
}

const opponent: Team = { ...team, id: 't2', clubId: 'c2', number: 6, playerIds: [] }

const matchDay: MatchDay = { id: 'md1', groupId: 'grp1', number: 1, date: '2025-09-17' }
const game: Game = { id: 'g1', matchDayId: 'md1', homeTeamId: 't1', awayTeamId: 't2', time: '19h30' }

beforeEach(() => {
  mockCreateEvent.mockClear().mockResolvedValue({ action: 'saved', id: 'e1' })
  mockAuth.user = { ...player, role: 'player', isPlayer: true }
  mockData.clubs = [club, opponentClub]
  mockData.teams = [team, opponent]
  mockData.players = [player]
  mockData.matchDays = [matchDay]
  mockData.games = [game]
  mockData.groups = [{ id: 'grp1', divisionId: 'd1', number: 1, teamIds: ['t1', 't2'], isArchived: false }]
  mockData.divisions = [
    { id: 'd1', phaseId: 'ph1', displayName: 'GE 5', rank: 5, playersPerGame: 4, isArchived: false },
  ]
})

describe("Détail d'un match — ajouter au calendrier", () => {
  it('offers the icon to a plain member, who composes nothing', () => {
    render(<MatchDetailScreen />)

    expect(screen.getByLabelText('Ajouter au calendrier')).toBeTruthy()
    // It sits in the header, not as a fourth full-width shortcut row.
    expect(screen.queryByText('Ajouter au calendrier')).toBeNull()
    expect(screen.queryByText("Composer l'équipe")).toBeNull()
  })

  it('hands the OS an event pre-filled with the match', async () => {
    render(<MatchDetailScreen />)

    fireEvent.press(screen.getByLabelText('Ajouter au calendrier'))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalled())
    expect(mockCreateEvent).toHaveBeenCalledWith({
      title: 'Rixheim PPA 4 – Mulhouse TT 6',
      startDate: new Date(2025, 8, 17, 19, 30),
      endDate: new Date(2025, 8, 17, 23, 0),
      allDay: false,
      location: 'Salle des sports, 12 rue du Stade, 68170 Rixheim',
      notes: 'Journée 1 · GE 5',
    })
  })

  it('titles an away match the way the header does — hosts first', async () => {
    mockData.games = [{ ...game, homeTeamId: 't2', awayTeamId: 't1' }]

    render(<MatchDetailScreen />)
    fireEvent.press(screen.getByLabelText('Ajouter au calendrier'))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalled())
    expect(mockCreateEvent.mock.calls[0][0]).toMatchObject({
      title: 'Mulhouse TT 6 – Rixheim PPA 4',
    })
  })

  it("takes the receiving club's default time when the fixture has none", async () => {
    // The screen read game.time raw (#427): a home fixture the club never gave
    // an explicit hour showed none, while the web said 19h30 for the same match.
    mockData.games = [{ ...game, time: undefined }]

    render(<MatchDetailScreen />)
    fireEvent.press(screen.getByLabelText('Ajouter au calendrier'))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalled())
    expect(mockCreateEvent.mock.calls[0][0]).toMatchObject({
      startDate: new Date(2025, 8, 17, 19, 30),
      allDay: false,
    })
  })

  it('offers no calendar at all away at a club whose playing day is unknown', () => {
    // An opponent created by the import: the FFTT's nominal date is a guess, so
    // the screen marks it and withholds the icon (#429). Nobody's agenda gets a
    // date the Journées matrix itself refuses to vouch for.
    mockData.teams = [team, { ...opponent, defaultDay: '', defaultTime: '' }]
    mockData.games = [{ ...game, time: undefined, homeTeamId: 't2', awayTeamId: 't1' }]

    render(<MatchDetailScreen />)

    expect(screen.queryByLabelText('Ajouter au calendrier')).toBeNull()
    expect(screen.getByText(/Date à confirmer/)).toBeTruthy()
  })

  it('books the whole day when the club plays a known day at no fixed hour', async () => {
    // The date is real — the club has a playing day — but nobody set an hour,
    // and an invented one in someone's agenda is worse than none.
    mockData.teams = [{ ...team, defaultTime: '' }, opponent]
    mockData.games = [{ ...game, time: undefined }]

    render(<MatchDetailScreen />)
    fireEvent.press(screen.getByLabelText('Ajouter au calendrier'))

    await waitFor(() => expect(mockCreateEvent).toHaveBeenCalled())
    expect(mockCreateEvent.mock.calls[0][0]).toMatchObject({ allDay: true })
  })

  it('says so rather than failing silently when the calendar cannot be opened', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    mockCreateEvent.mockRejectedValue(new Error('no calendar'))

    render(<MatchDetailScreen />)
    fireEvent.press(screen.getByLabelText('Ajouter au calendrier'))

    await waitFor(() => expect(alert).toHaveBeenCalled())
    expect(alert.mock.calls[0][1]).toContain('calendrier')
    alert.mockRestore()
  })
})
