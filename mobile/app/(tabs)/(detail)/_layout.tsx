import { useEffect } from 'react'
import { Stack, useRouter, useNavigation } from 'expo-router'
import { CommonActions } from '@react-navigation/native'
import { TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { displayFonts } from '@/constants/typography'

// Shared "detail" screens (player, team, match, match list) live in this Stack,
// which is registered as a hidden tab in (tabs)/_layout. Nesting them inside the
// Tabs navigator keeps the bottom menu visible while you drill in, so you can
// jump to any section at any time (issue #153) — while the Stack still gives a
// back button.
//
// The back button uses router.back() (navigation history) rather than the native
// stack back, so it also works on the first detail screen pushed onto this stack
// (whose own stack has nothing beneath it).
function BackButton() {
  const router = useRouter()
  if (!router.canGoBack()) return null
  return (
    <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ paddingRight: 12 }}>
      <Ionicons name="chevron-back" size={26} color="#fff" />
    </TouchableOpacity>
  )
}

// All shared detail screens share this one Stack (hosted in the hidden (detail)
// tab). React Navigation keeps that Stack mounted across tab switches, so
// without intervention it would accumulate every detail ever opened and the
// back button would replay the whole global history. There is no unmountOnBlur
// in React Navigation 7, so we clear this tab's nested stack whenever it's
// blurred (the user taps another tab, or backs out of the last detail to a
// tab). Drilling deeper *within* the detail flow (player → team → match) never
// blurs this tab, so those pushes still chain correctly for the back button.
type NavState = { routes: { name: string; key: string; state?: unknown }[]; index: number }
type Nav = {
  getState?: () => NavState
  getParent?: () => Nav | undefined
  dispatch: (action: unknown) => void
}

function useResetDetailStackOnBlur() {
  const navigation = useNavigation()
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        // Walk up to the Tabs navigator that owns the (detail) route and drop
        // its nested stack state so the next drill-in starts from scratch.
        // A fresh route key forces the nested navigator to remount — clearing
        // `state` alone keeps the live navigator mounted, which restores the
        // old stack.
        let nav: Nav | undefined = navigation as unknown as Nav
        while (nav) {
          const state = nav.getState?.()
          if (state?.routes?.some((r) => r.name === '(detail)')) {
            nav.dispatch((s: NavState) =>
              CommonActions.reset({
                ...s,
                routes: s.routes.map((r) =>
                  r.name === '(detail)'
                    ? { ...r, state: undefined, key: `(detail)-${Date.now()}` }
                    : r,
                ),
              } as Parameters<typeof CommonActions.reset>[0]),
            )
            break
          }
          nav = nav.getParent?.()
        }
      }),
    [navigation],
  )
}

export default function DetailLayout() {
  useResetDetailStackOnBlur()
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontFamily: displayFonts.semiBold },
        headerBackVisible: false,
        headerLeft: () => <BackButton />,
      }}
    >
      <Stack.Screen name="player/[id]" options={{ title: 'Joueur' }} />
      <Stack.Screen name="team/[id]" options={{ title: 'Équipe' }} />
      <Stack.Screen name="team/phase-games" options={{ title: 'Matchs' }} />
      <Stack.Screen name="match/[id]" options={{ title: 'Match' }} />
      <Stack.Screen name="mes-matchs" options={{ title: 'Mes matchs' }} />
    </Stack>
  )
}
