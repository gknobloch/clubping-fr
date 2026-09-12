import { render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import type { User } from '@shared/types'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { DataProvider, useAppData } from '@/contexts/DataContext'
import { setSession } from '@/utils/api'

// ---------------------------------------------------------------------------
// The whole chain, on the boot it was broken for (#513).
//
// AuthContext's own suite pins the session; this pins what that decision costs
// two modules away. The two are joined by a module holder: the token going null
// is how DataContext hears "logout", and a logout is what empties the cache. So
// a wrong verdict in AuthContext destroyed the offline data without either file
// mentioning the other, which is exactly why this test is not in either of them.
//
// The scenario is the one the feature exists for: a sports hall in a basement,
// no signal, a captain opening the app to read a line-up.
// ---------------------------------------------------------------------------

jest.mock('@/constants/api', () => ({
  ...jest.requireActual('@/constants/api'),
  API_BASE_URL: 'http://127.0.0.1:8788',
  IS_PRODUCTION_API: false,
  apiUrl: (path: string) => `http://127.0.0.1:8788/api${path}`,
}))

const CACHE_KEY = 'pp-club-data-cache'
const captain: User = {
  id: 'u-captain',
  role: 'player',
  isPlayer: true,
  firstName: 'Bo',
  lastName: 'Martin',
  email: 'bo@example.org',
}

const mockFetch = jest.fn()

function Probe() {
  const { isAuthenticated } = useAuth()
  const { teams, stale } = useAppData()
  return (
    <Text>{`auth:${isAuthenticated} teams:${teams.length} stale:${stale}`}</Text>
  )
}

/** Mounted the way app/_layout.tsx does: DataProvider outside AuthProvider. */
const mount = () =>
  render(
    <DataProvider>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </DataProvider>,
  )

beforeEach(async () => {
  await SecureStore.setItemAsync('pp-club-session', 'stored-token')
  await AsyncStorage.setItem('pp-club-user', JSON.stringify(captain))
  // Written for this member, as the app writes it since #509 — an entry naming
  // nobody is refused now, which is the whole point of that change.
  await AsyncStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      version: 1,
      userId: captain.id,
      data: { teams: [{ id: 't1' }, { id: 't2' }] },
      lastSyncedAt: '2026-09-01T10:00:00.000Z',
    }),
  )
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

afterEach(async () => {
  setSession(null, null)
  await SecureStore.deleteItemAsync('pp-club-session')
  await AsyncStorage.multiRemove([CACHE_KEY, 'pp-club-user'])
})

describe('opening the app with no signal (#513)', () => {
  it('shows the captain their cached line-up instead of the sign-in form', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'))

    mount()

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    // Signed in, reading two cached teams, and told the data is not fresh.
    await waitFor(() => expect(screen.getByText('auth:true teams:2 stale:true')).toBeTruthy())
  })

  it('leaves the cache on disk for the launch after that', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'))

    mount()
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(CACHE_KEY)).not.toBeNull(),
    )
  })
})

describe('opening the app against a revoked session (#513)', () => {
  // The cache is emptied here, and should be: the session is genuinely gone,
  // and leaving one member's club on a shared phone for the next is the thing
  // the logout handler exists to prevent.
  it('signs the member out and empties the cache', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    })

    mount()

    await waitFor(async () => expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull())
    expect(await SecureStore.getItemAsync('pp-club-session')).toBeNull()
  })
})

describe('a shared phone, offline (#509)', () => {
  it("never shows one member the previous member's club", async () => {
    // The tablet was last used by someone else, and there is no network to
    // correct the mistake with.
    await AsyncStorage.setItem('pp-club-user', JSON.stringify({ ...captain, id: 'u-other' }))
    mockFetch.mockRejectedValue(new TypeError('Network request failed'))

    mount()

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    // Signed in as the other member, and shown nothing: the cache on disk is
    // not theirs to read.
    await waitFor(() => expect(screen.getByText('auth:true teams:0 stale:true')).toBeTruthy())
  })

  // Refusing is not deleting — the entry is still there for whoever owns it.
  it('leaves the rightful owner their cache', async () => {
    await AsyncStorage.setItem('pp-club-user', JSON.stringify({ ...captain, id: 'u-other' }))
    mockFetch.mockRejectedValue(new TypeError('Network request failed'))

    mount()
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const raw = await AsyncStorage.getItem(CACHE_KEY)
    expect(JSON.parse(raw!).userId).toBe(captain.id)
  })
})
