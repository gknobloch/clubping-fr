import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataProvider, useAppData } from '@/contexts/DataContext'
import { mockClubs } from '@/mock/data'

const authState = vi.hoisted(() => ({
  devLogin: false,
  logout: vi.fn(),
  user: null as { id: string } | null,
}))

vi.mock('@/contexts/AuthContext', () => ({
  get DEV_LOGIN() {
    return authState.devLogin
  },
  useAuth: () => ({ token: null, logout: authState.logout, user: authState.user }),
}))

function Consumer() {
  const { clubs } = useAppData()
  return <div data-testid="clubs-count">{clubs.length}</div>
}

describe('DataProvider — API failure handling (#185)', () => {
  beforeEach(() => {
    authState.devLogin = false
    authState.user = null
    authState.logout.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to mock data when there is no real backend (dev/E2E)', async () => {
    authState.devLogin = true
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    render(
      <DataProvider>
        <Consumer />
      </DataProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('clubs-count').textContent).toBe(String(mockClubs.length))
    })
  })

  it('shows an error with a retry action instead of mock data when the API fails in production', async () => {
    authState.devLogin = false
    const fetchMock = vi.fn().mockRejectedValue(new Error('network error'))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <DataProvider>
        <Consumer />
      </DataProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText('Impossible de charger les données. Vérifiez votre connexion.')
      ).toBeInTheDocument()
    })
    expect(screen.queryByTestId('clubs-count')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('logs the user out on a 401 instead of showing mock data or an error', async () => {
    authState.devLogin = false
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    )

    render(
      <DataProvider>
        <Consumer />
      </DataProvider>
    )

    await waitFor(() => expect(authState.logout).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('Impossible de charger les données. Vérifiez votre connexion.')
    ).not.toBeInTheDocument()
  })
})

// #387 — offline, the app used to replace itself with an error page. A line-up
// is read in a sports hall, often a basement: the last known one is worth far
// more than an apology.
describe('DataProvider — offline (#387)', () => {
  function memoryStorage(): Storage {
    const map = new Map<string, string>()
    return {
      get length() { return map.size },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    } as Storage
  }

  beforeEach(() => {
    authState.devLogin = false
    authState.logout.mockClear()
    authState.user = { id: 'u1' }
    Object.defineProperty(window, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const payload = {
    seasons: [], phases: [], divisions: [], clubs: mockClubs, groups: [], teams: [],
    players: [], playerPhasePoints: [], matchDays: [], games: [],
    gameAvailabilities: [], gameSelections: [], users: [],
  }

  const renderApp = () =>
    render(
      <DataProvider>
        <Consumer />
      </DataProvider>,
    )

  it('keeps the last known data on screen when the refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }))
    const first = renderApp()
    await waitFor(() => {
      expect(screen.getByTestId('clubs-count').textContent).toBe(String(mockClubs.length))
    })
    first.unmount()

    // Same member, no network.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderApp()

    await waitFor(() => {
      expect(screen.getByTestId('clubs-count').textContent).toBe(String(mockClubs.length))
    })
    expect(
      screen.queryByText('Impossible de charger les données. Vérifiez votre connexion.'),
    ).not.toBeInTheDocument()
  })

  // The privacy rule: clubs share phones. Signing out has to take the cache
  // with it, or the next member meets the previous member's club.
  it('drops the cache once nobody is signed in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }))
    const first = renderApp()
    await waitFor(() => {
      expect(screen.getByTestId('clubs-count').textContent).toBe(String(mockClubs.length))
    })
    first.unmount()

    authState.user = null
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderApp()

    // Nothing cached to fall back on, so the honest error stands.
    await waitFor(() => {
      expect(
        screen.getByText('Impossible de charger les données. Vérifiez votre connexion.'),
      ).toBeInTheDocument()
    })
  })

  it('still errors when it fails with nothing cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderApp()

    await waitFor(() => {
      expect(
        screen.getByText('Impossible de charger les données. Vérifiez votre connexion.'),
      ).toBeInTheDocument()
    })
  })

  // The cache is preferred over the mock fallback even in dev, and this is why:
  // a cache only exists because a real fetch once succeeded for this member.
  // With the branches the other way round, dev builds showed fixtures while the
  // banner announced a date — a caption for data that was not theirs.
  it('prefers the cache to the mock fallback, so the banner never mislabels', async () => {
    const oneClub = { ...payload, clubs: [mockClubs[0]] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => oneClub }))
    const first = renderApp()
    await waitFor(() => {
      expect(screen.getByTestId('clubs-count').textContent).toBe('1')
    })
    first.unmount()

    authState.devLogin = true
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderApp()

    // The cached single club, not the full mock fixture set.
    await waitFor(() => {
      expect(screen.getByTestId('clubs-count').textContent).toBe('1')
    })
  })
})
