import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePathname, useGlobalSearchParams } from 'expo-router'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { colors } from '@/constants/colors'
import { useLayout } from '@/constants/layout'
import { fonts } from '@/constants/typography'

// The shared detail screens (player, team, match, match list) live in the hidden
// (detail) stack, so when you drill in no real tab is focused. We derive the
// section that should stay highlighted from the current path instead — the
// (detail) group elides from the URL, so e.g. a player detail is "/player/123".
//   /player/…                     → Joueurs
//   /mes-matchs?playerId=…        → Joueurs (a player's matches, from Joueurs)
//   /mes-matchs                   → Accueil (the "Tous mes matchs" shortcut)
//   /team/…  (incl. phase-games)  → Équipes
//   /match/…                      → Journées
// This keeps the menu reflecting where you conceptually are (#153).
//
// 'compte' is no longer a tab (#365) — it is reached from the header avatar —
// so returning it here leaves every tab unhighlighted, which is what we want
// while the account screen is open.
export function pathToTab(path: string, hasPlayerId: boolean): string {
  if (path.startsWith('/mes-matchs')) return hasPlayerId ? 'joueurs' : 'index'
  if (path.startsWith('/player')) return 'joueurs'
  if (path.startsWith('/team')) return 'equipes'
  if (path.startsWith('/match')) return 'journees'
  if (path.startsWith('/journees')) return 'journees'
  if (path.startsWith('/equipes')) return 'equipes'
  if (path.startsWith('/joueurs')) return 'joueurs'
  if (path.startsWith('/club')) return 'club'
  if (path.startsWith('/compte')) return 'compte'
  return 'index' // Accueil
}

/**
 * Widest the row of five tabs gets (#446). Spread over a whole slab, each tab
 * is a 10pt label centred in 200pt of nothing; capped, it stays a row of tabs.
 * The bar's background still runs edge to edge.
 */
const TAB_ROW_MAX_WIDTH = 560

/**
 * The rail's width, insets aside (#447). Wide enough for the longest label —
 * «Journées» at 10pt — on one line under its icon, and no wider: the rail is
 * paid for out of the content's width.
 */
const RAIL_WIDTH = 88

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { isTablet, hasSideRail } = useLayout()
  const { playerId } = useGlobalSearchParams<{ playerId?: string }>()
  const activeName = pathToTab(usePathname(), !!playerId)

  const items = state.routes.map((route, index) => {
    const { options } = descriptors[route.key]
    // Skip hidden tabs — expo-router turns href:null into display:'none'
    // (covers the (detail) stack).
    const itemStyle = options.tabBarItemStyle as { display?: string } | undefined
    if (itemStyle?.display === 'none') return null

    const isActive = route.name === activeName
    const isFocused = state.index === index
    const color = isActive ? colors.tabActive : colors.tabInactive
    const label = (options.title ?? route.name) as string

    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isActive ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          })
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name)
        }}
        style={hasSideRail ? styles.railItem : styles.item}
        activeOpacity={0.7}
      >
        {options.tabBarIcon?.({ focused: isActive, color, size: 24 })}
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    )
  })

  // A slab held sideways: the five destinations run down the left edge and the
  // screen's whole height goes to the content instead of to a horizontal bar
  // (#447). The navigator puts us here rather than at the foot — see
  // `tabBarPosition` in (tabs)/_layout — so this is a full-height column, above
  // which nothing else is drawn: it carries the status-bar inset itself.
  if (hasSideRail) {
    return (
      <View
        testID="tab-bar"
        style={[
          styles.rail,
          {
            width: RAIL_WIDTH + insets.left,
            paddingTop: insets.top + 12,
            paddingBottom: Math.max(insets.bottom, 12),
            paddingLeft: insets.left,
          },
        ]}
      >
        {items}
      </View>
    )
  }

  return (
    // Left/right insets alongside the bottom one (#445): in landscape the notch
    // sits beside the bar, and the first and last tabs would slide under it.
    <View
      testID="tab-bar"
      style={[
        styles.bar,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={[styles.row, isTablet && styles.rowCentred]}>{items}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  rail: {
    backgroundColor: colors.card,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  row: { flexDirection: 'row', width: '100%' },
  rowCentred: { maxWidth: TAB_ROW_MAX_WIDTH, alignSelf: 'center' },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  // Not `flex: 1`: five destinations spread down 800pt would be a tap target
  // the height of a hand. They sit at the top of the rail, as a menu does.
  railItem: { alignItems: 'center', gap: 3, paddingVertical: 14 },
  label: { fontSize: 10, fontFamily: fonts.semiBold },
})
