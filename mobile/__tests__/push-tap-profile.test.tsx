import { render, waitFor } from '@testing-library/react-native'
import * as Notifications from 'expo-notifications'
import { PushNotifications } from '@/components/PushNotifications'

// #640 — a parent's phone rings for the child's matches too. Tapping the
// child's reminder must open the child's screen: the app becomes the child
// first, then opens the match. And only for a profile the server named —
// a payload's word alone switches nothing.

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }))

const mockSwitch = jest.fn(async () => {})
let mockProfiles = [{ id: 'benjamin', role: 'player' }, { id: 'sacha', role: 'player' }]
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 'benjamin', role: 'player', isPlayer: true },
    profiles: mockProfiles,
    switchProfile: mockSwitch,
  }),
}))
jest.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({
    loading: false,
    games: [{ id: 'g1', homeTeamId: 't1', awayTeamId: 't2' }],
    teams: [{ id: 't1', playerIds: ['sacha'] }, { id: 't2', playerIds: [] }],
  }),
}))
jest.mock('@/utils/push', () => ({
  ...jest.requireActual('@/utils/push'),
  registerForPush: jest.fn(async () => {}),
}))

const tapped = (identifier: string, data: Record<string, unknown>) => ({
  notification: { request: { identifier, content: { data } } },
})

beforeEach(() => {
  mockPush.mockReset()
  mockSwitch.mockClear()
  mockProfiles = [{ id: 'benjamin', role: 'player' }, { id: 'sacha', role: 'player' }]
})

it('becomes the child before opening the child’s match', async () => {
  ;(Notifications.getLastNotificationResponseAsync as jest.Mock)
    .mockResolvedValueOnce(tapped('n1', { kind: 'availability_request', gameId: 'g1', userId: 'sacha' }))
  render(<PushNotifications />)
  await waitFor(() => expect(mockPush).toHaveBeenCalled())
  expect(mockSwitch).toHaveBeenCalledWith('sacha')
  expect(mockSwitch.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0])
  expect(mockPush.mock.calls[0][0]).toMatchObject({ pathname: '/match/[id]', params: { id: 'g1' } })
})

it('switches nothing for the profile already signed in', async () => {
  ;(Notifications.getLastNotificationResponseAsync as jest.Mock)
    .mockResolvedValueOnce(tapped('n2', { gameId: 'g1', userId: 'benjamin' }))
  render(<PushNotifications />)
  await waitFor(() => expect(mockPush).toHaveBeenCalled())
  expect(mockSwitch).not.toHaveBeenCalled()
})

it('switches nothing for someone the server did not name — offline, there are none', async () => {
  mockProfiles = []
  ;(Notifications.getLastNotificationResponseAsync as jest.Mock)
    .mockResolvedValueOnce(tapped('n3', { gameId: 'g1', userId: 'sacha' }))
  render(<PushNotifications />)
  await waitFor(() => expect(mockPush).toHaveBeenCalled())
  expect(mockSwitch).not.toHaveBeenCalled()
})
