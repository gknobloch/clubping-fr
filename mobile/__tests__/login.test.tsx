import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { DevUser } from '@shared/types'
import { AuthProvider } from '@/contexts/AuthContext'
import { setSessionToken } from '@/utils/api'
import LoginScreen from '@/app/login'

// ---------------------------------------------------------------------------
// The dev picker as the screen actually shows it (#358): expanded, it must
// list the users the backend returned. It listed nothing while the list came
// from DataContext, whose /api/data 401s before login.
//
// Lives here rather than next to the screen: expo-router turns every file
// under app/ into a route, so a test there is bundled into the app — and the
// build fails outright on testing-library's Node imports.
// ---------------------------------------------------------------------------
jest.mock('@/constants/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:8788',
  IS_PRODUCTION_API: false,
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

const mockFetch = jest.fn()

function renderScreen() {
  return render(
    <AuthProvider>
      <LoginScreen />
    </AuthProvider>,
  )
}

/** Expand "Connexion dev (test)" and wait for the list to arrive. */
async function openPicker() {
  renderScreen()
  fireEvent.press(await screen.findByText(/Connexion dev \(test\)/))
  return screen
}

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  setSessionToken(null)
})

it('shows the brand mark', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ users: [] }) })

  renderScreen()

  // The app had no identity anywhere before (#366); this is where a member
  // meets it first.
  expect(await screen.findByLabelText('Club Ping')).toBeTruthy()
})

it('gives the primary label the whole button to sit in', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ users: [] }) })

  renderScreen()

  // Shrink-wrapped to its own text, the label has no slack, and a face that
  // measures a few pixels narrower than it draws clips its last glyph —
  // "Recevoir un cod" on a device, never on a simulator (#472). Stretched, the
  // frame is the button's and the text centres itself inside it.
  expect(await screen.findByText('Recevoir un code')).toHaveStyle({
    alignSelf: 'stretch',
    textAlign: 'center',
  })
})

it('lists the backend users once expanded', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ users: [admin, captain] }) })

  await openPicker()

  expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
  expect(screen.getByText('Bo Martin')).toBeTruthy()
  // Club and captaincy are what tell members apart at a glance.
  expect(screen.getByText('Joueur · capitaine 3, 5 · Ping Club')).toBeTruthy()
})

it('filters on name, club or role', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ users: [admin, captain] }) })

  await openPicker()
  await screen.findByText('Ada Lovelace')

  fireEvent.changeText(screen.getByPlaceholderText('Rechercher…'), 'ping club')

  expect(screen.getByText('Bo Martin')).toBeTruthy()
  expect(screen.queryByText('Ada Lovelace')).toBeNull()
})

it('explains itself when the backend exposes no dev login', async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) })

  await openPicker()

  await waitFor(() =>
    expect(screen.getByText(/l’API locale n’expose pas la connexion dev/)).toBeTruthy(),
  )
  expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull()
})

it('reports a failed sign-in rather than doing nothing', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ users: [admin] }) })

  await openPicker()
  const card = await screen.findByText('Ada Lovelace')

  // From here on the backend refuses the sign-in.
  mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'no_account' }) })
  fireEvent.press(card)

  expect(await screen.findByText('Connexion impossible pour cet utilisateur.')).toBeTruthy()
})
