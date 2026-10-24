import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import type { GameAvailability, Profile, User } from '@shared/types'
import type { ReviewPromptState } from '@shared/lib/reviewPrompt'
import { noteOwnYes } from '@/utils/storeReview'
import { ReviewPrompt } from './ReviewPrompt'

// ---------------------------------------------------------------------------
// #781 — after the member's own « Oui », and only then: the system prompt on
// iOS, our three-button sheet on Android, nothing under a managed profile or
// offline, and nothing the server says is not due.
// ---------------------------------------------------------------------------
const DAY = 86_400_000
const member: User = { id: 'u1', role: 'player', isPlayer: true, firstName: 'Bo', lastName: 'Martin' }
const mockAuth: { user: User | null; profiles: Profile[] } = { user: member, profiles: [] }
const mockData: { gameAvailabilities: GameAvailability[]; stale: boolean } = { gameAvailabilities: [], stale: false }
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => mockData }))

const mockFetchState = jest.fn<Promise<ReviewPromptState | null>, []>()
const mockRecord = jest.fn()
const mockSystem = jest.fn<Promise<boolean>, []>()
const mockOpen = jest.fn()
jest.mock('@/utils/storeReview', () => ({
  ...jest.requireActual('@/utils/storeReview'),
  fetchReviewPrompt: () => mockFetchState(),
  recordReviewEvent: (e: string) => mockRecord(e),
  requestSystemReview: () => mockSystem(),
  openReviewPage: () => mockOpen(),
}))

const answers = (n: number): GameAvailability[] =>
  Array.from({ length: n }, (_, i) => ({ gameId: `g${i}`, playerId: 'u1', status: 'available' as const }))

async function sayYes() {
  await act(async () => {
    noteOwnYes()
    await Promise.resolve()
  })
  await act(async () => {
    jest.advanceTimersByTime(2000)
    await Promise.resolve()
  })
}

const originalOS = Platform.OS
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockAuth.user = member
  mockAuth.profiles = []
  mockData.gameAvailabilities = answers(5)
  mockData.stale = false
  mockFetchState.mockResolvedValue({ firstSeenAt: Date.now() - 30 * DAY, askedCount: 0 })
  mockSystem.mockResolvedValue(true)
})
afterEach(() => {
  jest.useRealTimers()
  Platform.OS = originalOS
})

it('hands the moment to the system prompt on iOS, and counts it', async () => {
  Platform.OS = 'ios'
  render(<ReviewPrompt />)
  await sayYes()
  expect(mockSystem).toHaveBeenCalledTimes(1)
  expect(mockRecord).toHaveBeenCalledWith('asked')
  expect(screen.queryByTestId('review-prompt')).toBeNull()
})

describe('on Android, the sheet', () => {
  beforeEach(() => {
    Platform.OS = 'android'
  })

  it('opens the store and stops on « Donner mon avis »', async () => {
    render(<ReviewPrompt />)
    await sayYes()
    fireEvent.press(screen.getByTestId('review-prompt-review'))
    expect(mockRecord).toHaveBeenCalledWith('reviewed')
    expect(mockOpen).toHaveBeenCalled()
    expect(screen.queryByTestId('review-prompt')).toBeNull()
    expect(mockSystem).not.toHaveBeenCalled()
  })

  it('records « Plus tard » and « Ne plus demander » for what they are', async () => {
    const { unmount } = render(<ReviewPrompt />)
    await sayYes()
    fireEvent.press(screen.getByTestId('review-prompt-later'))
    expect(mockRecord).toHaveBeenLastCalledWith('asked')
    unmount()

    render(<ReviewPrompt />)
    await sayYes()
    fireEvent.press(screen.getByTestId('review-prompt-never'))
    expect(mockRecord).toHaveBeenLastCalledWith('declined')
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('looks once per launch, not at every « Oui »', async () => {
    mockFetchState.mockResolvedValue({ firstSeenAt: Date.now(), askedCount: 0 })
    render(<ReviewPrompt />)
    await sayYes()
    await sayYes()
    expect(mockFetchState).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('review-prompt')).toBeNull()
  })
})

it('never asks under a managed profile', async () => {
  mockAuth.profiles = [
    { id: 'u1', firstName: 'Chloé', lastName: 'Bernard', role: 'player', managed: true } as Profile,
    { id: 'u2', firstName: 'Nathan', lastName: 'Thomas', role: 'player', signedIn: true } as Profile,
  ]
  render(<ReviewPrompt />)
  await sayYes()
  expect(mockFetchState).not.toHaveBeenCalled()
  expect(mockSystem).not.toHaveBeenCalled()
})

it('never asks from cached data, nor when the server is not reached', async () => {
  mockData.stale = true
  const { unmount } = render(<ReviewPrompt />)
  await sayYes()
  expect(mockFetchState).not.toHaveBeenCalled()
  unmount()

  mockData.stale = false
  mockFetchState.mockResolvedValue(null)
  render(<ReviewPrompt />)
  await sayYes()
  expect(mockSystem).not.toHaveBeenCalled()
  expect(screen.queryByTestId('review-prompt')).toBeNull()
})

it('waits for a few answers of the member’s own', async () => {
  mockData.gameAvailabilities = [
    ...answers(1),
    { gameId: 'g9', playerId: 'u1', status: 'available', overriddenBy: 'captain' },
    { gameId: 'g8', playerId: 'other', status: 'available' },
  ]
  render(<ReviewPrompt />)
  await sayYes()
  expect(mockSystem).not.toHaveBeenCalled()
})
