import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Profile, User } from '@shared/types'
import { AppHeader } from '@/components/AppHeader'

// ---------------------------------------------------------------------------
// #720 — the header avatar opens the account menu: who is signed in (name,
// club, role), the way to Compte, then the other profiles the person may open,
// by club. Switching used to be at the bottom of Compte.
// ---------------------------------------------------------------------------
const mockRouter = { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() }
const nathan: User = { id: 'nathan', role: 'club_admin', isPlayer: true, firstName: 'Nathan', lastName: 'Thomas', clubId: 'landser' }
const profile = (id: string, firstName: string, clubId: string, clubName: string, role: Profile['role'] = 'player'): Profile =>
  ({ id, firstName, lastName: id === 'nathan' ? 'Thomas' : 'Bernard', role, clubId, clubName })
const mockAuth = {
  user: nathan as User | null,
  displayName: 'Nathan Thomas',
  profiles: [] as Profile[],
  switchProfile: jest.fn(() => Promise.resolve()),
}

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('@/contexts/DataContext', () => ({
  useAppData: () => ({ players: [], users: [], clubs: [{ id: 'landser', displayName: 'ASL Landser' }] }),
}))

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}
const openMenu = () => {
  render(<SafeAreaProvider initialMetrics={metrics}><AppHeader title="Accueil" /></SafeAreaProvider>)
  fireEvent.press(screen.getByLabelText('Mon compte'))
  return screen.getByTestId('account-menu')
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.profiles = []
})

it('says who is signed in — name, club, role — and leads to Compte', () => {
  const menu = openMenu()
  expect(within(menu).getByText('Nathan Thomas')).toBeTruthy()
  expect(within(menu).getByText('ASL Landser')).toBeTruthy()
  expect(within(menu).getByText('Administrateur de club')).toBeTruthy()
  // A single profile: nothing to switch to, so no list.
  expect(within(menu).queryByText('Changer de profil')).toBeNull()

  fireEvent.press(screen.getByTestId('account-menu-compte'))
  expect(mockRouter.push).toHaveBeenCalledWith('/compte')
  expect(screen.queryByTestId('account-menu')).toBeNull()
})

it('lists the other profiles by club, and switches to one', async () => {
  mockAuth.profiles = [
    profile('nathan', 'Nathan', 'landser', 'ASL Landser', 'club_admin'),
    profile('chloe', 'Chloé', 'rixheim', 'Rixheim PPA'),
  ]
  const menu = openMenu()
  expect(within(menu).getByText('Changer de profil')).toBeTruthy()
  expect(within(menu).getByText('Rixheim PPA')).toBeTruthy()
  // The current profile is on top already, not offered again.
  expect(within(menu).queryByTestId('profile-nathan')).toBeNull()

  fireEvent.press(within(menu).getByTestId('profile-chloe'))
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'))
  expect(mockAuth.switchProfile).toHaveBeenCalledWith('chloe')
  expect(screen.queryByTestId('account-menu')).toBeNull()
})

it('closes on a tap outside it', () => {
  openMenu()
  fireEvent.press(screen.getByTestId('account-menu-backdrop'))
  expect(screen.queryByTestId('account-menu')).toBeNull()
})
