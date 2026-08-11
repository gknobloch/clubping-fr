import * as SecureStore from 'expo-secure-store'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { DevUser } from '@shared/types'
import { getSessionToken, setSessionToken } from '@/utils/api'
import { AuthProvider, useAuth } from './AuthContext'

// ---------------------------------------------------------------------------
// Dev login (#358). The picker used to be fed from DataContext's `users`, i.e.
// from `GET /api/data` — which needs a session and therefore 401s on the login
// screen, leaving the list empty. It now comes from the sessionless
// `/api/auth/dev/users`, and picking someone takes a real session.
// ---------------------------------------------------------------------------

// Dev login is gated on the app targeting a local backend; the module's default
// is the production host, which would switch it off in tests.
jest.mock('@/constants/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:8788',
  IS_DEPLOYED_API: false,
  apiUrl: (path: string) => `http://127.0.0.1:8788/api${path}`,
}))

const admin: DevUser = {
  id: 'u-admin',
  role: 'general_admin',
  isPlayer: false,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.org',
}

const captain: DevUser = {
  id: 'u-captain',
  role: 'player',
  isPlayer: true,
  firstName: 'Bo',
  lastName: 'Martin',
  email: 'bo@example.org',
  clubName: 'Ping Club',
  captainOf: [3, 5],
}

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const errorResponse = (status: number, error: string) => ({
  ok: false,
  status,
  json: async () => ({ error }),
})

const mockFetch = jest.fn()

function render() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider })
}

/** URLs of every request made so far, in order. */
const requestedUrls = () => mockFetch.mock.calls.map(([url]) => url as string)

beforeEach(async () => {
  // SecureStore is in-memory for the whole file (jest.setup.js): without this
  // a session written by one test is restored by the next one's first mount.
  await SecureStore.deleteItemAsync('pp-club-session')
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  // The token lives in a module holder shared across tests; a leftover value
  // would make the next mount think a user is signed in.
  setSessionToken(null)
})

describe('AuthProvider — dev user list', () => {
  it('populates the picker from /api/auth/dev/users', async () => {
    mockFetch.mockResolvedValue(okResponse({ users: [admin, captain] }))

    const { result } = render()

    await waitFor(() => expect(result.current.availableUsers).toHaveLength(2))
    // Server order is kept as-is (administrators first), and the picker's two
    // distinguishing fields survive the round trip.
    expect(result.current.availableUsers.map((u) => u.id)).toEqual(['u-admin', 'u-captain'])
    expect(result.current.availableUsers[1].clubName).toBe('Ping Club')
    expect(result.current.availableUsers[1].captainOf).toEqual([3, 5])
  })

  it('asks the sessionless endpoint, never /api/data', async () => {
    mockFetch.mockResolvedValue(okResponse({ users: [admin] }))

    const { result } = render()

    await waitFor(() => expect(result.current.availableUsers).toHaveLength(1))
    expect(requestedUrls()).toContain('http://127.0.0.1:8788/api/auth/dev/users')
    expect(requestedUrls().some((url) => url.endsWith('/api/data'))).toBe(false)
  })

  it('leaves the picker empty when the backend has no dev login', async () => {
    // 404 is the normal answer without DEV_LOGIN_ENABLED, and must not throw.
    mockFetch.mockResolvedValue(errorResponse(404, 'not_found'))

    const { result } = render()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.availableUsers).toEqual([])
  })
})

describe('AuthProvider — devLoginAs', () => {
  async function mounted() {
    mockFetch.mockResolvedValue(okResponse({ users: [admin, captain] }))
    const rendered = render()
    await waitFor(() => expect(rendered.result.current.availableUsers).toHaveLength(2))
    mockFetch.mockReset()
    return rendered
  }

  it('takes a real session and signs the user in', async () => {
    const { result } = await mounted()
    mockFetch.mockResolvedValue(okResponse({ token: 'dev-session', user: captain }))

    await act(async () => {
      await result.current.devLoginAs('u-captain')
    })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:8788/api/auth/dev/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ userId: 'u-captain' })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(captain)
    expect(result.current.displayName).toBe('Bo Martin')
    // The token has to reach the module holder, or DataContext's fetch of
    // /api/data comes back 401 and every screen is empty (#138).
    expect(getSessionToken()).toBe('dev-session')
  })

  it('surfaces a rejection instead of signing anybody in', async () => {
    const { result } = await mounted()
    mockFetch.mockResolvedValue(errorResponse(403, 'no_account'))

    await act(async () => {
      await expect(result.current.devLoginAs('u-captain')).rejects.toMatchObject({
        status: 403,
        code: 'no_account',
      })
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(getSessionToken()).toBeNull()
  })

  it('restores the session on the next mount', async () => {
    const { result, unmount } = await mounted()
    mockFetch.mockResolvedValue(okResponse({ token: 'dev-session', user: captain }))
    await act(async () => {
      await result.current.devLoginAs('u-captain')
    })
    unmount()
    setSessionToken(null)

    // Fresh launch: the stored token is validated through /api/auth/me, the
    // same path a real OTP session takes.
    mockFetch.mockReset()
    mockFetch.mockImplementation(async (url: string) =>
      url.endsWith('/api/auth/me')
        ? okResponse({ user: captain })
        : okResponse({ users: [admin, captain] }),
    )
    const second = render()

    await waitFor(() => expect(second.result.current.isAuthenticated).toBe(true))
    expect(second.result.current.user).toEqual(captain)
    expect(getSessionToken()).toBe('dev-session')
  })
})
