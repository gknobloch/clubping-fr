import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

// ---------------------------------------------------------------------------
// Session restore (#370)
//
// The session used to live in localStorage alone. Safari deletes that after
// 7 days without a first-party visit, so members came back to a login screen
// with a session that still had weeks to run. The API now also sets an
// HttpOnly cookie, and these pin what the client does with it — a cookie the
// client never consults would fix nothing.
// ---------------------------------------------------------------------------
const SESSION_KEY = 'pp-club-session'

// happy-dom 20 ships no localStorage, which is why AuthContext wraps every
// access in a try/catch. Tests that care about the stored token need a real
// one; `useStorage(false)` takes it away again, which is both this
// environment's default and what a Safari private tab looks like.
function useStorage(available: boolean) {
  if (!available) {
    Reflect.deleteProperty(window, 'localStorage')
    return
  }
  const map = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    },
  })
}

const member = {
  id: 'u1',
  role: 'player' as const,
  isPlayer: true,
  firstName: 'Bo',
  lastName: 'Martin',
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const unauthorized = { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) }

const mockFetch = vi.fn()

/** Requests made so far, as [url, init] pairs. */
const callTo = (path: string) =>
  mockFetch.mock.calls.find(([url]) => String(url).includes(path)) as [string, RequestInit] | undefined

function render() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider })
}

beforeEach(() => {
  useStorage(true)
  mockFetch.mockReset()
  // The picker's list is fetched on mount when dev login is on, which it is in
  // a test build; answer it so it never reaches the assertions below.
  mockFetch.mockImplementation(async (url: string) =>
    String(url).includes('/auth/dev/users') ? ok({ users: [] }) : unauthorized,
  )
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useStorage(false)
})

describe('restoring a session', () => {
  it('signs in from the cookie when localStorage has been wiped', async () => {
    // Safari's 7-day cap in one line: no stored token, cookie still good.
    mockFetch.mockImplementation(async (url: string) =>
      String(url).includes('/auth/me') ? ok({ user: member }) : ok({ users: [] }),
    )

    const { result } = render()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(member)
    // Nothing to send: the browser attaches the cookie itself.
    expect(result.current.token).toBeNull()
    expect(callTo('/auth/me')?.[1]?.headers).toEqual({})
  })

  it('still prefers a stored token when there is one', async () => {
    window.localStorage.setItem(SESSION_KEY, 'stored-token')
    mockFetch.mockImplementation(async (url: string) =>
      String(url).includes('/auth/me') ? ok({ user: member }) : ok({ users: [] }),
    )

    const { result } = render()

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    expect(result.current.token).toBe('stored-token')
    expect(callTo('/auth/me')?.[1]?.headers).toEqual({ Authorization: 'Bearer stored-token' })
  })

  it('falls back to the cookie when the stored token is stale', async () => {
    window.localStorage.setItem(SESSION_KEY, 'revoked-token')
    let seen = 0
    mockFetch.mockImplementation(async (url: string) => {
      if (!String(url).includes('/auth/me')) return ok({ users: [] })
      // First call carries the dead token; the retry carries nothing but the
      // cookie, which is still valid.
      return ++seen === 1 ? unauthorized : ok({ user: member })
    })

    const { result } = render()

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull()
    expect(result.current.token).toBeNull()
  })

  it('signs in from the cookie even when storage is unavailable', async () => {
    // A Safari private tab, or any browser that refuses storage: before the
    // cookie there was no way to stay signed in at all.
    useStorage(false)
    mockFetch.mockImplementation(async (url: string) =>
      String(url).includes('/auth/me') ? ok({ user: member }) : ok({ users: [] }),
    )

    const { result } = render()

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
  })

  it('shows no user when neither credential works', async () => {
    const { result } = render()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
  })
})

describe('logging out', () => {
  it('calls the API even with no token to send, so the cookie is cleared', async () => {
    mockFetch.mockImplementation(async (url: string) =>
      String(url).includes('/auth/me') ? ok({ user: member }) : ok({ users: [] }),
    )
    const { result } = render()
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    mockFetch.mockClear()

    act(() => {
      result.current.logout()
    })

    // Skipping the request would leave the cookie in place — and the next
    // reload would sign the member straight back in.
    const [url, init] = callTo('/auth/logout') ?? []
    expect(url).toBeTruthy()
    expect(init?.method).toBe('POST')
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('says nothing to the API when nobody was signed in', async () => {
    // DataContext calls logout() on any 401, including the ones the login page
    // itself makes — telling the server to end a session that never began just
    // answers 401 back.
    const { result } = render()
    await waitFor(() => expect(result.current.loading).toBe(false))
    mockFetch.mockClear()

    act(() => {
      result.current.logout()
    })

    expect(callTo('/auth/logout')).toBeUndefined()
  })
})
