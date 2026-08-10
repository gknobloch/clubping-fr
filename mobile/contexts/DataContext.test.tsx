import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { setSessionToken } from '@/utils/api'
import { readCache, writeCache } from '@/utils/offlineCache'
import { DataProvider, useAppData } from './DataContext'

// ---------------------------------------------------------------------------
// Offline behaviour of DataProvider (#144, #147) plus the availability write
// path (#282/#319), which nothing covered on the client side.
// ---------------------------------------------------------------------------

/** The `GET /api/data` payload — every collection the provider stores. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    clubs: [],
    seasons: [],
    phases: [],
    divisions: [],
    groups: [],
    teams: [],
    players: [],
    matchDays: [],
    games: [],
    gameAvailabilities: [],
    gameSelections: [],
    users: [],
    ...overrides,
  }
}

const club = (id: string, name: string) => ({ id, name })

/** A promise whose settlement the test controls, to observe in-flight state. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

const mockFetch = jest.fn()

function render() {
  return renderHook(() => useAppData(), { wrapper: DataProvider })
}

beforeEach(async () => {
  await AsyncStorage.clear()
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  // The token lives in a module holder shared across tests; a leftover value
  // would make the next provider mount think a user is signed in.
  setSessionToken(null)
})

describe('DataProvider — cold start hydration', () => {
  it('renders cached data before the first fetch resolves', async () => {
    await writeCache(payload({ clubs: [club('c1', 'Ping Club')] }), '2026-01-15T10:00:00.000Z')
    const inflight = deferred<unknown>()
    mockFetch.mockReturnValue(inflight.promise)

    const { result } = render()

    // Cache first: usable content, flagged stale, while the network request is
    // still in the air.
    await waitFor(() => expect(result.current.clubs).toEqual([club('c1', 'Ping Club')]))
    expect(result.current.stale).toBe(true)
    expect(result.current.lastSyncedAt).toBe('2026-01-15T10:00:00.000Z')
    // No spinner over content we can already show: hydration succeeded, so the
    // in-flight fetch runs in 'background' mode and raises neither flag.
    expect(result.current.loading).toBe(false)
    expect(result.current.refreshing).toBe(false)

    await act(async () => {
      inflight.resolve(okResponse(payload({ clubs: [club('c1', 'Ping Club rénové')] })))
    })

    // The fetch then wins and the stale flag drops.
    await waitFor(() => expect(result.current.stale).toBe(false))
    expect(result.current.clubs).toEqual([club('c1', 'Ping Club rénové')])
  })

  it('keeps the full-screen loading flag when there is nothing to show', async () => {
    const inflight = deferred<unknown>()
    mockFetch.mockReturnValue(inflight.promise)

    const { result } = render()

    // The other half of the branch above: with no cache there is no content to
    // protect, so the initial fetch does own the full-screen spinner.
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(result.current.loading).toBe(true)

    await act(async () => {
      inflight.resolve(okResponse(payload({ clubs: [club('c1', 'Ping Club')] })))
    })

    expect(result.current.loading).toBe(false)
  })

  it('starts empty and not stale when nothing is cached', async () => {
    mockFetch.mockResolvedValue(okResponse(payload({ clubs: [club('c1', 'Ping Club')] })))

    const { result } = render()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.stale).toBe(false)
    expect(result.current.clubs).toEqual([club('c1', 'Ping Club')])
  })
})

describe('DataProvider — successful fetch', () => {
  it('clears stale, records the sync time and writes the cache', async () => {
    const body = payload({ clubs: [club('c1', 'Ping Club')] })
    mockFetch.mockResolvedValue(okResponse(body))

    const { result } = render()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.stale).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.lastSyncedAt).not.toBeNull()

    // Persisted for the next cold start, with the same timestamp the UI shows.
    await waitFor(async () => expect(await readCache()).not.toBeNull())
    expect(await readCache()).toEqual({
      data: body,
      lastSyncedAt: result.current.lastSyncedAt,
    })
  })

  it('treats a non-2xx response as a failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    const { result } = render()

    await waitFor(() => expect(result.current.error).toBe('HTTP 500'))
    expect(result.current.stale).toBe(true)
    // Nothing half-written: a rejected fetch must not poison the cache.
    expect(await readCache()).toBeNull()
  })
})

describe('DataProvider — fetch failure', () => {
  it('keeps the cached data on screen and flags it stale', async () => {
    const cached = payload({ clubs: [club('c1', 'Ping Club')] })
    await writeCache(cached, '2026-01-15T10:00:00.000Z')
    mockFetch.mockRejectedValue(new Error('Network request failed'))

    const { result } = render()

    await waitFor(() => expect(result.current.error).toBe('Network request failed'))
    expect(result.current.clubs).toEqual([club('c1', 'Ping Club')])
    expect(result.current.stale).toBe(true)
    // The cache is still there for the next launch — a failed fetch never
    // invalidates it.
    expect(await readCache()).toEqual({ data: cached, lastSyncedAt: '2026-01-15T10:00:00.000Z' })
    expect(result.current.lastSyncedAt).toBe('2026-01-15T10:00:00.000Z')
  })

  it('keeps previously fetched data when a later refresh fails', async () => {
    mockFetch.mockResolvedValueOnce(okResponse(payload({ clubs: [club('c1', 'Ping Club')] })))
    const { result } = render()
    await waitFor(() => expect(result.current.clubs).toHaveLength(1))
    const syncedAt = result.current.lastSyncedAt

    mockFetch.mockRejectedValueOnce(new Error('Network request failed'))
    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => expect(result.current.stale).toBe(true))
    expect(result.current.clubs).toEqual([club('c1', 'Ping Club')])
    // Still the time of the last *successful* sync, which is what the offline
    // banner reports.
    expect(result.current.lastSyncedAt).toBe(syncedAt)
  })
})

describe('DataProvider — logout', () => {
  it('drops the cache and resets state when the session token is cleared', async () => {
    mockFetch.mockResolvedValue(okResponse(payload({ clubs: [club('c1', 'Ping Club')] })))
    const { result } = render()
    await waitFor(() => expect(result.current.clubs).toHaveLength(1))
    expect(await readCache()).not.toBeNull()

    // Sign in, then out. Only the second transition is a logout; the first is
    // what makes it one.
    await act(async () => {
      setSessionToken('session-token')
    })
    await waitFor(() => expect(result.current.clubs).toHaveLength(1))

    mockFetch.mockRejectedValue(new Error('Unauthorized'))
    await act(async () => {
      setSessionToken(null)
    })

    // No trace of the previous user, on screen or on disk.
    await waitFor(() => expect(result.current.clubs).toEqual([]))
    expect(result.current.lastSyncedAt).toBeNull()
    await waitFor(async () => expect(await readCache()).toBeNull())
  })

  it('refetches when a user signs in', async () => {
    mockFetch.mockResolvedValue(okResponse(payload()))
    const { result } = render()
    await waitFor(() => expect(result.current.loading).toBe(false))
    const initialCalls = mockFetch.mock.calls.length

    mockFetch.mockResolvedValue(okResponse(payload({ clubs: [club('c1', 'Ping Club')] })))
    await act(async () => {
      setSessionToken('session-token')
    })

    await waitFor(() => expect(result.current.clubs).toHaveLength(1))
    expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCalls)
  })
})

// #319 left "does availability still work on mobile?" unchecked. The API route
// is covered by functions/api/gameAvailability.test.ts; these fix the client
// half — the optimistic row keyed on (gameId, playerId), and the request.
describe('DataProvider — setAvailability', () => {
  async function mounted(initial = payload()) {
    mockFetch.mockResolvedValue(okResponse(initial))
    const rendered = render()
    await waitFor(() => expect(rendered.result.current.loading).toBe(false))
    mockFetch.mockClear()
    mockFetch.mockResolvedValue(okResponse({}))
    return rendered
  }

  it('adds an optimistic row and posts it', async () => {
    const { result } = await mounted()

    await act(async () => {
      await result.current.setAvailability('p1', 'g1', 'available')
    })

    expect(result.current.gameAvailabilities).toEqual([
      { playerId: 'p1', gameId: 'g1', status: 'available' },
    ])
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/game-availabilities/set')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      playerId: 'p1',
      gameId: 'g1',
      status: 'available',
    })
  })

  it('updates the existing row in place rather than duplicating it', async () => {
    const { result } = await mounted(
      payload({ gameAvailabilities: [{ playerId: 'p1', gameId: 'g1', status: 'available' }] }),
    )

    await act(async () => {
      await result.current.setAvailability('p1', 'g1', 'unavailable')
    })

    // One row, not two: since 0033 (#282) the pair is the identity, and the
    // API upserts on it — a duplicate here would desync on the next reload.
    expect(result.current.gameAvailabilities).toEqual([
      { playerId: 'p1', gameId: 'g1', status: 'unavailable' },
    ])
  })

  it('leaves other players and other games untouched', async () => {
    const others = [
      { playerId: 'p2', gameId: 'g1', status: 'available' as const },
      { playerId: 'p1', gameId: 'g2', status: 'available' as const },
    ]
    const { result } = await mounted(payload({ gameAvailabilities: others }))

    await act(async () => {
      await result.current.setAvailability('p1', 'g1', 'unavailable')
    })

    expect(result.current.gameAvailabilities).toEqual([
      ...others,
      { playerId: 'p1', gameId: 'g1', status: 'unavailable' },
    ])
  })

  it('removes the row and posts a clear when the answer is withdrawn', async () => {
    const { result } = await mounted(
      payload({
        gameAvailabilities: [
          { playerId: 'p1', gameId: 'g1', status: 'available' },
          { playerId: 'p2', gameId: 'g1', status: 'available' },
        ],
      }),
    )

    await act(async () => {
      await result.current.clearAvailability('p1', 'g1')
    })

    expect(result.current.gameAvailabilities).toEqual([
      { playerId: 'p2', gameId: 'g1', status: 'available' },
    ])
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/game-availabilities/clear')
    expect(JSON.parse(init.body)).toEqual({ playerId: 'p1', gameId: 'g1' })
  })

  it('still updates the UI while offline, without a request', async () => {
    // No successful fetch, so `apiAvailable` is false — the tap must still
    // register on screen rather than doing nothing.
    mockFetch.mockRejectedValue(new Error('Network request failed'))
    const { result } = render()
    await waitFor(() => expect(result.current.stale).toBe(true))
    mockFetch.mockClear()

    await act(async () => {
      await result.current.setAvailability('p1', 'g1', 'available')
    })

    expect(result.current.gameAvailabilities).toEqual([
      { playerId: 'p1', gameId: 'g1', status: 'available' },
    ])
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
