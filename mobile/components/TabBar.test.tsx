import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import {
  PHONE_WIDTH,
  TABLET_LANDSCAPE,
  TABLET_LARGE,
  resetWindowSize,
  setWindowSize,
} from '@/__tests__/support/window'
import { HEADER_HEIGHT } from './AppHeader'
import { colors } from '@/constants/colors'
import { TabBar, pathToTab } from './TabBar'

jest.mock('expo-router', () => ({
  usePathname: () => '/equipes',
  useGlobalSearchParams: () => ({}),
}))

// Which tab stays highlighted for a given path (#153). The detail screens live
// in a hidden stack, so nothing derives this from the navigator — this mapping
// is it, and a missing entry silently highlights Accueil.
describe('pathToTab', () => {
  it.each([
    ['/', 'index'],
    ['/club', 'club'],
    ['/equipes', 'equipes'],
    ['/journees', 'journees'],
    ['/joueurs', 'joueurs'],
  ])('maps the section %s to %s', (path, tab) => {
    expect(pathToTab(path, false)).toBe(tab)
  })

  it.each([
    ['/player/p1', 'joueurs'],
    ['/team/t1', 'equipes'],
    ['/team/phase-games', 'equipes'],
    ['/match/g1', 'journees'],
  ])('keeps the section highlighted while drilling into %s', (path, tab) => {
    expect(pathToTab(path, false)).toBe(tab)
  })

  it('splits "mes matchs" by where it was opened from', () => {
    expect(pathToTab('/mes-matchs', true)).toBe('joueurs') // a player's matches
    expect(pathToTab('/mes-matchs', false)).toBe('index') // the Accueil shortcut
  })

  it('highlights no tab on the account screen', () => {
    // Compte left the tab bar for the header avatar (#365), so its route name
    // matches no rendered tab — which is what leaves them all inactive.
    expect(pathToTab('/compte', false)).toBe('compte')
  })
})

// ---------------------------------------------------------------------------
// The bar, and the rail it becomes (#447)
//
// On a slab held sideways the five destinations run down the left edge: the
// navigator puts the bar there (`tabBarPosition`) and this draws itself to
// match. The two must agree — a column rendered at the foot of the window, or
// a full-width row rendered down its side, are both a broken screen — so what
// is pinned here is the shape, and the rule that decides it.
// ---------------------------------------------------------------------------
describe('the tab bar on a tablet', () => {
  afterEach(resetWindowSize)

  const TITLES: Record<string, string> = {
    index: 'Accueil',
    club: 'Club',
    equipes: 'Équipes',
    journees: 'Journées',
    joueurs: 'Joueurs',
  }

  const navigate = jest.fn()

  /** The five real tabs plus the hidden (detail) stack, as the navigator passes them. */
  function tabBarProps(): BottomTabBarProps {
    const routes = [...Object.keys(TITLES), '(detail)'].map((name) => ({ key: `key-${name}`, name }))
    const descriptors = Object.fromEntries(
      routes.map((r) => [
        r.key,
        {
          options:
            r.name === '(detail)'
              ? { tabBarItemStyle: { display: 'none' } }
              : { title: TITLES[r.name], tabBarIcon: () => null },
        },
      ]),
    )
    return {
      state: { index: 2, routes },
      descriptors,
      navigation: { emit: () => ({ defaultPrevented: false }), navigate },
    } as unknown as BottomTabBarProps
  }

  /** No notch on a slab; a home indicator at the foot and a status bar on top. */
  const metrics: Metrics = {
    frame: { x: 0, y: 0, ...TABLET_LANDSCAPE },
    insets: { top: 24, left: 0, right: 0, bottom: 20 },
  }

  const renderBar = () =>
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <TabBar {...tabBarProps()} />
      </SafeAreaProvider>,
    )

  const barStyle = () => StyleSheet.flatten(screen.getByTestId('tab-bar').props.style)

  beforeEach(() => navigate.mockClear())

  it('runs down the left edge of a slab held sideways', () => {
    setWindowSize(TABLET_LANDSCAPE)

    renderBar()

    // A fixed width — the rail is paid for out of the content's — and a rule
    // down its inner edge rather than across its top.
    expect(barStyle().width).toBe(88)
    const items = StyleSheet.flatten(screen.getByTestId('tab-rail-items').props.style)
    expect(items.borderRightWidth).toBe(StyleSheet.hairlineWidth)
    expect(barStyle().borderTopWidth).toBeUndefined()
  })

  it('carries the header across its own top rather than starting beside it', () => {
    // The rail is a sibling *before* the screens, so it runs the full height
    // and the header begins to its right. Without this the white column runs
    // up behind the status bar, whose clock and date are drawn across the
    // whole width and land on it.
    setWindowSize(TABLET_LANDSCAPE)

    renderBar()

    const cap = StyleSheet.flatten(screen.getByTestId('tab-rail-cap').props.style)
    expect(cap.height).toBe(HEADER_HEIGHT + 24) // the bar, plus the status bar
    expect(cap.backgroundColor).toBe(colors.primary) // the header's own navy
  })

  it('stays a row across the foot when the slab stands up', () => {
    setWindowSize(TABLET_LARGE)

    renderBar()

    const style = barStyle()
    expect(style.width).toBeUndefined()
    expect(style.borderTopWidth).toBe(StyleSheet.hairlineWidth)
    // The bottom inset, not the top one: it sits at the foot of the window.
    expect(style.paddingBottom).toBe(20)
    expect(screen.queryByTestId('tab-rail-cap')).toBeNull()
  })

  it('leaves a phone the bar it has always had', () => {
    setWindowSize(PHONE_WIDTH)

    renderBar()

    expect(barStyle().width).toBeUndefined()
  })

  it.each([
    ['a rail', TABLET_LANDSCAPE],
    ['a row', PHONE_WIDTH],
  ])('shows the five destinations and hides the (detail) stack, as %s', (_shape, size) => {
    setWindowSize(size)

    renderBar()

    for (const label of Object.values(TITLES)) expect(screen.getByText(label)).toBeTruthy()
    expect(screen.queryByText('(detail)')).toBeNull()
  })

  it('navigates from the rail, as the row does', () => {
    setWindowSize(TABLET_LANDSCAPE)

    renderBar()
    fireEvent.press(screen.getByText('Journées'))

    expect(navigate).toHaveBeenCalledWith('journees')
  })
})
