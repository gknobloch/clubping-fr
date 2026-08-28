import { render, screen } from '@testing-library/react-native'
import { View } from 'react-native'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// The root layout must not lay a screen out before the brand faces are loaded
// (#472).
//
// Holding the native splash — all this did before — hides the fonts swapping
// in, but not the measurements taken underneath it: a screen mounted in the
// system fallback keeps the fallback's Yoga dimensions once DM Sans replaces
// it, and a centred button label, whose frame is its own measured width, comes
// out a glyph short. So the gate is on the render, not just on the splash.
// ---------------------------------------------------------------------------

let mockFontsResult: [boolean, Error | null] = [true, null]

jest.mock('expo-font', () => ({ useFonts: () => mockFontsResult }))
jest.mock('@expo-google-fonts/dm-sans', () => ({
  DMSans_400Regular: 'DMSans_400Regular',
  DMSans_500Medium: 'DMSans_500Medium',
  DMSans_600SemiBold: 'DMSans_600SemiBold',
  DMSans_700Bold: 'DMSans_700Bold',
  DMSans_800ExtraBold: 'DMSans_800ExtraBold',
}))
jest.mock('@expo-google-fonts/outfit', () => ({
  Outfit_600SemiBold: 'Outfit_600SemiBold',
  Outfit_700Bold: 'Outfit_700Bold',
}))

const mockHideAsync = jest.fn().mockResolvedValue(undefined)
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  hideAsync: () => mockHideAsync(),
}))

// Enough of the navigator to tell "mounted" from "not mounted". Declared out
// here, `Mock`-prefixed, because a jest.mock factory may only reach for names
// spelled that way — and building it inside the factory would mean `require`.
function MockStack({ children }: { children?: ReactNode }) {
  return <View testID="navigator">{children}</View>
}
MockStack.Screen = () => null
MockStack.Protected = ({ children, guard }: { children?: ReactNode; guard: boolean }) =>
  guard ? <>{children}</> : null

jest.mock('expo-router', () => ({ Stack: MockStack }))

// The real provider renders nothing until it has measured a window, and there
// is none here. Insets are not what this test is about — pass the tree through.
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
}))

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('@/components/OfflineBanner', () => ({ OfflineBanner: () => null }))
jest.mock('@/contexts/DataContext', () => ({
  DataProvider: ({ children }: { children: ReactNode }) => children,
}))
jest.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isAuthenticated: false, loading: false }),
}))

// Imported after the mocks are registered — the module runs
// `preventAutoHideAsync()` at import time.
import RootLayout from '@/app/_layout'

beforeEach(() => {
  mockHideAsync.mockClear()
  mockFontsResult = [true, null]
})

it('renders nothing until the fonts have loaded', () => {
  mockFontsResult = [false, null]

  render(<RootLayout />)

  expect(screen.queryByTestId('navigator')).toBeNull()
  // And the splash stays up over the blank frame, rather than uncovering it.
  expect(mockHideAsync).not.toHaveBeenCalled()
})

it('mounts the navigator once the fonts are in memory', () => {
  render(<RootLayout />)

  expect(screen.getByTestId('navigator')).toBeTruthy()
  expect(mockHideAsync).toHaveBeenCalled()
})

it('gives up on a font that fails rather than holding the app forever', () => {
  // A missing .ttf leaves the system face in place — worse-looking, still a
  // working app. It must never be a blank screen behind a splash that never
  // lifts.
  mockFontsResult = [false, new Error('no such font')]

  render(<RootLayout />)

  expect(screen.getByTestId('navigator')).toBeTruthy()
  expect(mockHideAsync).toHaveBeenCalled()
})
