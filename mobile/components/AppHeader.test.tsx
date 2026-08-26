import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
  PHONE_WIDTH,
  TABLET_LARGE,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
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

// The same phone on its side: no status-bar inset any more, and a notch on one
// end of the bar instead. Only reachable since the app stopped being locked to
// portrait (#445).
const landscapeMetrics = {
  frame: { x: 0, y: 0, width: 844, height: 390 },
  insets: { top: 0, left: 59, right: 59, bottom: 21 },
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

it('shows the brand mark instead of a back chevron on a tab screen', () => {
  renderHeader(<AppHeader title="Accueil" />)

  expect(screen.queryByLabelText('Retour')).toBeNull()
  // The left slot is reserved for the chevron either way, so the mark rides
  // along for free — and puts the brand on every screen (#366).
  expect(screen.getByTestId('brand-mark')).toBeTruthy()
})

it('goes back from a pushed screen, the chevron taking the mark\u2019s place', () => {
  renderHeader(<AppHeader title="Joueur" showBack />)

  expect(screen.queryByTestId('brand-mark')).toBeNull()
  fireEvent.press(screen.getByLabelText('Retour'))

  expect(mockRouter.back).toHaveBeenCalled()
})

it('falls back to the mark when there is nothing to go back to', () => {
  mockRouter.canGoBack.mockReturnValue(false)

  renderHeader(<AppHeader title="Joueur" showBack />)

  expect(screen.queryByLabelText('Retour')).toBeNull()
  expect(screen.getByTestId('brand-mark')).toBeTruthy()
})

it('renders nothing for the account of a signed-out user', () => {
  // The header mounts before the session is restored; it must not assume one.
  mockAuth.user = null

  renderHeader(<AppHeader title="Accueil" />)

  expect(screen.getByText('Accueil')).toBeTruthy()
  expect(screen.queryByLabelText('Mon compte')).toBeNull()
})

it('keeps its content clear of a landscape notch', () => {
  render(
    <SafeAreaProvider initialMetrics={landscapeMetrics}>
      <AppHeader title="Journées" />
    </SafeAreaProvider>,
  )

  // The bar's own 12pt, plus the inset — the background still runs edge to
  // edge, only the mark and the avatar move in.
  const style = StyleSheet.flatten(screen.getByTestId('app-header').props.style)
  expect(style.paddingLeft).toBe(12 + 59)
  expect(style.paddingRight).toBe(12 + 59)
  expect(style.paddingTop).toBe(0)
})

describe('on a tablet (#446)', () => {
  afterEach(resetWindowSize)

  const titleStyle = (title: string) => StyleSheet.flatten(screen.getByText(title).props.style)

  it('centres the title in the bar on a phone', () => {
    setWindowSize(PHONE_WIDTH)

    renderHeader(<AppHeader title="Journées" />)

    expect(titleStyle('Journées').textAlign).toBe('center')
  })

  it('sets the title beside the mark rather than in the middle of nothing', () => {
    setWindowSize(TABLET_LARGE)

    renderHeader(<AppHeader title="Journées" />)

    expect(titleStyle('Journées').textAlign).toBe('left')
  })
})
