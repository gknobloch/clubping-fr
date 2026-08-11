import { fireEvent, render, screen } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { User } from '@shared/types'
import { AppHeader } from './AppHeader'

// ---------------------------------------------------------------------------
// The one header every navigator renders (#365). Its contract is what keeps
// the bar identical across tabs and detail screens, so it is worth pinning:
// the title, the account button, and the back chevron that only the pushed
// screens get.
// ---------------------------------------------------------------------------
const mockRouter = { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }
const mockAuth: { user: User | null } = { user: null }

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({ useAppData: () => ({ players: [] }) }))

const member: User = { id: 'u1', role: 'player', isPlayer: true, firstName: 'Bo', lastName: 'Martin' }

// The header sizes itself from the status-bar inset, so it needs a provider —
// with fixed metrics, since there is no window to measure in a test.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

function renderHeader(element: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>)
}

beforeEach(() => {
  mockRouter.push.mockClear()
  mockRouter.back.mockClear()
  mockRouter.canGoBack.mockReturnValue(true)
  mockAuth.user = member
})

it('shows the screen title', () => {
  renderHeader(<AppHeader title="Journées" />)

  expect(screen.getByText('Journées')).toBeTruthy()
})

it('offers the account button, which opens Compte', () => {
  renderHeader(<AppHeader title="Accueil" />)

  fireEvent.press(screen.getByLabelText('Mon compte'))

  expect(mockRouter.push).toHaveBeenCalledWith('/compte')
})

it('drops the account button where it would lead nowhere new', () => {
  renderHeader(<AppHeader title="Compte" showAccount={false} />)

  expect(screen.queryByLabelText('Mon compte')).toBeNull()
})

it('shows no back chevron on a tab screen', () => {
  renderHeader(<AppHeader title="Accueil" />)

  expect(screen.queryByLabelText('Retour')).toBeNull()
})

it('goes back from a pushed screen', () => {
  renderHeader(<AppHeader title="Joueur" showBack />)

  fireEvent.press(screen.getByLabelText('Retour'))

  expect(mockRouter.back).toHaveBeenCalled()
})

it('hides the chevron when there is nothing to go back to', () => {
  mockRouter.canGoBack.mockReturnValue(false)

  renderHeader(<AppHeader title="Joueur" showBack />)

  expect(screen.queryByLabelText('Retour')).toBeNull()
})

it('renders nothing for the account of a signed-out user', () => {
  // The header mounts before the session is restored; it must not assume one.
  mockAuth.user = null

  renderHeader(<AppHeader title="Accueil" />)

  expect(screen.getByText('Accueil')).toBeTruthy()
  expect(screen.queryByLabelText('Mon compte')).toBeNull()
})
