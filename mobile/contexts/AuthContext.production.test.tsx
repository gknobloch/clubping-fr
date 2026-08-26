import { renderHook, waitFor } from '@testing-library/react-native'
import { AuthProvider, DEV_LOGIN, useAuth } from './AuthContext'

// ---------------------------------------------------------------------------
// The other half of the dev-login gate (#112, #358): against production there
// must be no picker and no request for one — a preview is another matter
// (#452). A separate file because IS_PRODUCTION_API is read at module load, so
// the cases cannot share one module registry.
// ---------------------------------------------------------------------------
jest.mock('@/constants/api', () => ({
  API_BASE_URL: 'https://clubping.fr',
  IS_PRODUCTION_API: true,
  apiUrl: (path: string) => `https://clubping.fr/api${path}`,
}))

const mockFetch = jest.fn()

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

it('offers no dev login and never asks for the user list', async () => {
  expect(DEV_LOGIN).toBe(false)

  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.availableUsers).toEqual([])
  expect(mockFetch).not.toHaveBeenCalled()
})
