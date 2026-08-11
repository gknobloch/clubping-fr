import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePathname, useGlobalSearchParams } from 'expo-router'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { colors } from '@/constants/colors'
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
function pathToTab(path: string, hasPlayerId: boolean): string {
  if (path.startsWith('/mes-matchs')) return hasPlayerId ? 'joueurs' : 'index'
  if (path.startsWith('/player')) return 'joueurs'
  if (path.startsWith('/team')) return 'equipes'
  if (path.startsWith('/match')) return 'journees'
  if (path.startsWith('/journees')) return 'journees'
  if (path.startsWith('/equipes')) return 'equipes'
  if (path.startsWith('/joueurs')) return 'joueurs'
  if (path.startsWith('/compte')) return 'compte'
  return 'index' // Accueil
}

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { playerId } = useGlobalSearchParams<{ playerId?: string }>()
  const activeName = pathToTab(usePathname(), !!playerId)

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
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
            style={styles.item}
            activeOpacity={0.7}
          >
            {options.tabBarIcon?.({ focused: isActive, color, size: 24 })}
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontSize: 10, fontFamily: fonts.semiBold },
})
