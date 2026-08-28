import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
} from '@expo-google-fonts/dm-sans'
import { Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { OfflineBanner } from '@/components/OfflineBanner'
import { DataProvider } from '@/contexts/DataContext'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'

// Hold the native splash until the persisted session has been restored —
// otherwise the splash hides while expo-router is still mounting the right
// screen, briefly revealing the (tabs) Accueil behind it.
SplashScreen.preventAutoHideAsync().catch(() => {})

// ---------------------------------------------------------------------------
// Stack with declarative auth gating
//
// `Stack.Protected` (expo-router 5) hides a screen from the navigator when
// its guard is false, so we never render the (tabs) screen for an
// unauthenticated user. While the session is still being restored we keep
// login visible (with the splash still up on top), so the first thing the
// user sees once the splash dismisses is the right screen for their state.
// ---------------------------------------------------------------------------
function AuthedRoutes({ fontsReady }: { fontsReady: boolean }) {
  const { isAuthenticated, loading } = useAuth()

  // The splash already waits for the session; make it wait for the fonts too
  // (#360). Dropping it earlier shows one frame in the system face before the
  // brand faces swap in, which reads as a flicker rather than as a load.
  useEffect(() => {
    if (!loading && fontsReady) SplashScreen.hideAsync().catch(() => {})
  }, [loading, fontsReady])

  // Nothing is laid out before the brand faces are in memory (#472). Holding
  // the splash was never enough: it hid the swap, not the measurements taken
  // under it. A screen mounted while the fonts load is measured in the system
  // fallback, and React Native redraws it in DM Sans without remeasuring — so
  // any label whose frame is its own measured width, a centred button label,
  // loses its last glyph. A simulator reads the .ttf off the host disk fast
  // enough to win that race; a cold start on a device does not.
  if (!fontsReady) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={loading || !isAuthenticated}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!loading && isAuthenticated}>
        {/* The tabs host everything, including the shared detail screens (in the
            hidden (detail) group), so the tab bar stays visible while drilling
            in — see app/(tabs)/(detail)/_layout.tsx (#153). */}
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Root layout
//
// DataProvider wraps AuthProvider (not the other way round) because the
// session token lives in a module holder both read: AuthProvider sets it on
// login, DataProvider subscribes and refetches. Auth needs nothing from the
// data payload — the dev picker has its own sessionless endpoint (#358).
// ---------------------------------------------------------------------------
export default function RootLayout() {
  // `error` is deliberately not fatal: a font that fails to load leaves the
  // system face in place, which is worse-looking but still a working app —
  // better than holding the splash forever over a missing .ttf.
  const [loaded, error] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMSans_800ExtraBold,
    Outfit_600SemiBold,
    Outfit_700Bold,
  })

  return (
    <SafeAreaProvider>
      <DataProvider>
        <AuthProvider>
          {/* Banner sits above the navigator so it pushes screen headers down
              rather than overlapping them; it renders nothing when online. */}
          <View style={{ flex: 1 }}>
            <OfflineBanner />
            <AuthedRoutes fontsReady={loaded || error !== null} />
          </View>
          {/* Light content, not `auto` (#364): `auto` follows the colour
              scheme — dark text in light mode — but what sits behind the
              status bar is always dark, whatever the scheme. Every header is
              colors.primary and the login screen is a dark photo, so in light
              mode `auto` painted the clock black on navy. It looked right only
              on a simulator set to dark. */}
          <StatusBar style="light" />
        </AuthProvider>
      </DataProvider>
    </SafeAreaProvider>
  )
}
