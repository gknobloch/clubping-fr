import { useEffect } from 'react'
import { Stack, useNavigation } from 'expo-router'
import { CommonActions } from '@react-navigation/native'
import { AppHeader } from '@/components/AppHeader'

// Shared "detail" screens (player, team, match, match list) live in this Stack,
// which is registered as a hidden tab in (tabs)/_layout. Nesting them inside the
// Tabs navigator keeps the bottom menu visible while you drill in, so you can
// jump to any section at any time (issue #153) — while the Stack still gives a
// back button.
//
// The header is the app's one AppHeader, back chevron included, so a detail
// screen's bar is the same bar as a tab's (#365).
const detailHeader = ({ options, route }: { options: { title?: string }; route: { name: string } }) => (
  <AppHeader title={options.title ?? route.name} showBack />
)

// All shared detail screens share this one Stack (hosted in the hidden (detail)
// tab). React Navigation keeps that Stack mounted across tab switches, so
// without intervention it would accumulate every detail ever opened and the
// back button would replay the whole global history. There is no unmountOnBlur
// in React Navigation 7, so we clear this tab's nested stack whenever it's
// blurred (the user taps another tab, or backs out of the last detail to a
// tab). Drilling deeper *within* the detail flow (player → team → match) never
// blurs this tab, so those pushes still chain correctly for the back button.
//
// The two-pane sections (#447) leave this rule exactly as it is, and that was
// the point of building them the way they are. A pane is not a screen you
// blur: had the right-hand pane been this Stack rendered beside its list, the
// reset would have had to mean something else — and it is the only thing
// stopping the back button from replaying every fiche ever opened. Instead the
// pane renders the fiche's component directly (see (tabs)/equipes/index), and
// this Stack keeps its one job: a detail *pushed over* a section, which is
// still what a phone does everywhere, and what a tablet does for anything that
// is not in the list beside it.
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
    <Stack screenOptions={{ header: detailHeader }}>
      <Stack.Screen name="player/[id]" options={{ title: 'Joueur' }} />
      <Stack.Screen name="team/[id]" options={{ title: 'Équipe' }} />
      <Stack.Screen name="team/phase-games" options={{ title: 'Matchs' }} />
      <Stack.Screen name="match/[id]" options={{ title: 'Match' }} />
      <Stack.Screen name="mes-matchs" options={{ title: 'Mes matchs' }} />
    </Stack>
  )
}
