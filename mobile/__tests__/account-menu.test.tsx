import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Profile, User } from '@shared/types'
import { AppHeader } from '@/components/AppHeader'

// ---------------------------------------------------------------------------
// #720 — the header avatar opens the account menu: who is signed in (name,
// club, role), the way to Compte, then the profiles the person may open.
// Switching used to be at the bottom of Compte. #749 — their own clubs as one
// list, a row per club and the current one ticked; the profiles delegated to
// them as another; and a banner under the header on one of those.
// ---------------------------------------------------------------------------
const mockRouter = { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() }
const nathan: User = { id: 'nathan', role: 'club_admin', isPlayer: true, firstName: 'Nathan', lastName: 'Thomas', clubId: 'landser' }
const profile = (id: string, firstName: string, clubId: string, clubName: string, role: Profile['role'] = 'player', flags: Partial<Profile> = {}): Profile =>
  ({ id, firstName, lastName: firstName === 'Nathan' ? 'Thomas' : 'Bernard', role, clubId, clubName, ...flags })
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
  mockAuth.user = nathan
  mockAuth.profiles = []
})

it('says who is signed in — name, club, role — and leads to Compte', () => {
  const menu = openMenu()
  expect(within(menu).getByText('Nathan Thomas')).toBeTruthy()
  expect(within(menu).getByText('ASL Landser · Administrateur de club')).toBeTruthy()
  // A single profile: nothing to switch to, so no list.
  expect(within(menu).queryByText('Mes clubs')).toBeNull()

  fireEvent.press(screen.getByTestId('account-menu-compte'))
  expect(mockRouter.push).toHaveBeenCalledWith('/compte')
  expect(screen.queryByTestId('account-menu')).toBeNull()
})

it('lists the person’s clubs, ticked where they are, and the profiles they manage', async () => {
  mockAuth.profiles = [
    profile('nathan', 'Nathan', 'landser', 'ASL Landser', 'club_admin', { signedIn: true }),
    profile('nathan-rix', 'Nathan', 'rixheim', 'Rixheim PPA', 'player'),
    profile('chloe', 'Chloé', 'rixheim', 'Rixheim PPA', 'player', { managed: true }),
  ]
  const menu = openMenu()
  expect(within(menu).getByText('Mes clubs')).toBeTruthy()
  expect(within(menu).getByText('Profils que vous gérez')).toBeTruthy()
  // A row of « Mes clubs » is the club; the current one is listed, selected.
  expect(within(menu).getByTestId('profile-nathan').props.accessibilityState).toMatchObject({ selected: true })
  expect(within(menu).getByLabelText('Rixheim PPA, Joueur')).toBeTruthy()
  // A delegated profile is the person.
  expect(within(menu).getByLabelText('Chloé Bernard, Rixheim PPA · Joueur')).toBeTruthy()

  fireEvent.press(within(menu).getByTestId('profile-chloe'))
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'))
  expect(mockAuth.switchProfile).toHaveBeenCalledWith('chloe')
  expect(screen.queryByTestId('account-menu')).toBeNull()
})

it('says whose profile is open on a delegated one, and goes back in a tap', async () => {
  mockAuth.user = { ...nathan, id: 'chloe', firstName: 'Chloé', lastName: 'Bernard', clubId: 'rixheim', role: 'player' }
  mockAuth.profiles = [
    profile('chloe', 'Chloé', 'rixheim', 'Rixheim PPA', 'player', { managed: true }),
    profile('nathan', 'Nathan', 'landser', 'ASL Landser', 'club_admin', { signedIn: true }),
  ]
  render(<SafeAreaProvider initialMetrics={metrics}><AppHeader title="Accueil" /></SafeAreaProvider>)
  expect(screen.getByTestId('managed-profile-banner')).toBeTruthy()
  expect(screen.getByText('Chloé Bernard')).toBeTruthy()
  fireEvent.press(screen.getByTestId('managed-profile-back'))
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'))
  expect(mockAuth.switchProfile).toHaveBeenCalledWith('nathan')
})

it('puts up no banner on one’s own profile', () => {
  mockAuth.profiles = [
    profile('nathan', 'Nathan', 'landser', 'ASL Landser', 'club_admin', { signedIn: true }),
    profile('chloe', 'Chloé', 'rixheim', 'Rixheim PPA', 'player', { managed: true }),
  ]
  render(<SafeAreaProvider initialMetrics={metrics}><AppHeader title="Accueil" /></SafeAreaProvider>)
  expect(screen.queryByTestId('managed-profile-banner')).toBeNull()
})

it('closes on a tap outside it', () => {
  openMenu()
  fireEvent.press(screen.getByTestId('account-menu-backdrop'))
  expect(screen.queryByTestId('account-menu')).toBeNull()
})
