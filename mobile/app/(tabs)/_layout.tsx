import type { ComponentProps } from 'react'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { TabBar } from '@/components/TabBar'
import { displayFonts } from '@/constants/typography'

type IconName = ComponentProps<typeof Ionicons>['name']

// Monochrome tab icons, tinted by the active/inactive tab color.
function tabIcon(name: IconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  )
}

export default function TabLayout() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontFamily: displayFonts.semiBold },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Accueil', tabBarIcon: tabIcon('home-outline') }}
      />
      <Tabs.Screen
        name="journees"
        options={{ title: 'Journées', headerShown: false, tabBarIcon: tabIcon('calendar-outline') }}
      />
      <Tabs.Screen
        name="equipes"
        options={{ title: 'Équipes', headerShown: false, tabBarIcon: tabIcon('people-outline') }}
      />
      <Tabs.Screen
        name="joueurs"
        options={{ title: 'Joueurs', headerShown: false, tabBarIcon: tabIcon('person-outline') }}
      />
      <Tabs.Screen
        name="compte"
        options={{ title: 'Compte', tabBarIcon: tabIcon('person-circle-outline') }}
      />
      {/* Shared detail screens (player, team, match, match list) — a hidden tab
          hosting a Stack, so the tab bar stays visible while drilling in (#153). */}
      <Tabs.Screen name="(detail)" options={{ href: null, headerShown: false }} />
    </Tabs>
  )
}
