import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SharedGameLinks } from '@/components/SharedGameLinks'
import { redirectSystemPath } from '@/app/+native-intent'
import { peekSharedGame, takeSharedGame } from '@/utils/sharedGameLink'

// #747 — a shared match link opens the match under the profile that plays it:
// held by the native intent until there is a session, then a switch if
// another reached profile is the one in the team, and a question when two are.

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }))

const mockSwitch = jest.fn(async () => {})
let mockProfiles: Array<{ id: string; role: string; clubId?: string; firstName?: string; lastName?: string }> = []
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 'benjamin', role: 'player', clubId: 'rix', firstName: 'Benjamin', lastName: 'Henaut' },
    profiles: mockProfiles,
    switchProfile: mockSwitch,
  }),
}))
let mockTeams = [{ id: 't1', clubId: 'rix', number: 1, playerIds: ['sacha'] }, { id: 't2', clubId: 'kembs', number: 2, playerIds: [] }]
jest.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    loading: false,
    games: [{ id: 'g1', matchDayId: 'md1', homeTeamId: 't1', awayTeamId: 't2' }],
    teams: mockTeams,
    gameSelections: [],
    clubs: [{ id: 'rix', displayName: 'Rixheim' }, { id: 'kembs', displayName: 'Kembs' }],
    players: [],
    users: [],
  }),
}))

beforeEach(() => {
  mockPush.mockReset()
  mockSwitch.mockClear()
  takeSharedGame()
  mockProfiles = [
    { id: 'benjamin', role: 'player', clubId: 'rix', firstName: 'Benjamin', lastName: 'Henaut' },
    { id: 'sacha', role: 'player', clubId: 'rix', firstName: 'Sacha', lastName: 'Henaut' },
  ]
  mockTeams = [{ id: 't1', clubId: 'rix', number: 1, playerIds: ['sacha'] }, { id: 't2', clubId: 'kembs', number: 2, playerIds: [] }]
})

describe('the native intent', () => {
  it('holds a shared match and sends the navigator to the Accueil', () => {
    expect(redirectSystemPath({ path: 'https://clubping.fr/match/g1?equipe=t2', initial: true })).toBe('/')
    expect(peekSharedGame()).toEqual({ gameId: 'g1', teamId: 't2' })
  })

  it('routes anything else as it came', () => {
    expect(redirectSystemPath({ path: '/journees', initial: false })).toBe('/journees')
    expect(peekSharedGame()).toBeNull()
  })
})

describe('opening it', () => {
  it('becomes the delegated profile that plays, then opens its side', async () => {
    redirectSystemPath({ path: 'clubping://match/g1?equipe=t2', initial: true })
    render(<SharedGameLinks />)
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(mockSwitch).toHaveBeenCalledWith('sacha')
    expect(mockSwitch.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0])
    expect(mockPush.mock.calls[0][0]).toEqual({ pathname: '/match/[id]', params: { id: 'g1', teamId: 't1' } })
    expect(peekSharedGame()).toBeNull()
  })

  it('asks when two reached profiles play in it, and opens the one chosen', async () => {
    mockTeams = [{ id: 't1', clubId: 'rix', number: 1, playerIds: ['sacha', 'benjamin'] }, mockTeams[1]]
    redirectSystemPath({ path: '/match/g1', initial: false })
    render(<SharedGameLinks />)
    expect(await screen.findByText('Ouvrir le match en tant que…')).toBeTruthy()
    expect(mockPush).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('shared-game-profile-benjamin'))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(mockSwitch).not.toHaveBeenCalled()
  })

  it('switches nothing offline, where the server named no profile — and opens on its own club’s side', async () => {
    mockProfiles = []
    redirectSystemPath({ path: '/match/g1?equipe=t2', initial: true })
    render(<SharedGameLinks />)
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(mockSwitch).not.toHaveBeenCalled()
    // Benjamin is of Rixheim: the sender's Kembs side is only a hint.
    expect(mockPush.mock.calls[0][0]).toMatchObject({ params: { id: 'g1', teamId: 't1' } })
  })

  it('opens a link that arrives while the app is already open', async () => {
    render(<SharedGameLinks />)
    expect(mockPush).not.toHaveBeenCalled()
    act(() => {
      redirectSystemPath({ path: '/match/g1', initial: false })
    })
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
  })
})
